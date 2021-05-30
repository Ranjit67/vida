const express = require("express");
const socket = require("socket.io");
var firebase = require("firebase");
const nodemailer = require("nodemailer");
const app = express();
app.use(express.json());
const http = require("http");
require("dotenv").config();
const server = http.createServer(app);
// const option = {
//   cors: {
//     origin: "http://localhost:3000",
//     methods: ["GET", "POST"],
//     allowedHeaders: ["my-custom-header"],
//     credentials: true,
//   },
// };
const io = socket(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true,
  },
});
// io.set("origins", "*");
// , {
//   cors: {
//     origins: "*:*",
//   },
// }
// io.origins("*:*");
// set cors
// app.use(function (req, res, next) {
//   res.header("Access-Control-Allow-Origin", "*");

//   res.header(
//     "Access-Control-Allow-Headers",
//     "Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers,X-Access-Token,XKey,Authorization"
//   );

//   if (req.method === "OPTIONS") {
//     res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE");
//     return res.status(200).json({});
//   }
//   next();
// });
//cors end

//firebase data
// const fire = firebase.initializeApp({
//   apiKey: process.env.REACT_APP_FIREBASE_API_KEY, // Auth / General Use
//   appId: process.env.REACT_APP_FIREBASE_APP_ID, // General Use
//   projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID, // General Use
//   authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN, // Auth with popup/redirect
//   databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL, // Realtime Database
//   storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET, // Storage
//   messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID, // Cloud Messaging
//   measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID, // Analytics
// });
// // const auth = fire.auth();
// const database = fire.database();
// const storage = fire.storage();
//firebase end
const schedule = {};
const room = {};
const idToRoom = {};
const roomToId = {};
const mutedMentor = {};
const videoMute = {};
//student
const studentConnectedTo = {};
const studentIdToUuid = {};
const UuidToStudentId = {};
const recordRaw = {};
// const mentorStaticId = {};

//start
io.on("connection", (socket) => {
  socket.on("mentor start class", async (payload) => {
    const { mentorId, scheduleID } = payload;
    // console.log(room[mentorId]);
    if (room?.[mentorId]?.length > 0 && schedule[mentorId] === scheduleID) {
      await room[mentorId].forEach((userUUid) => {
        const makeSoId = UuidToStudentId[userUUid];
        socket.emit("student want to connect", {
          studentId: makeSoId,
        });
      });
    } else {
      room[mentorId] = [];

      schedule[mentorId] = scheduleID;
      idToRoom[socket.id] = mentorId;
      roomToId[mentorId] = socket.id;
      mutedMentor[mentorId] = true;
      videoMute[mentorId] = true;
    }
  });
  // medil start
  socket.on("mentor refresh try", (payload) => {
    const { mentorUui } = payload;
    delete roomToId[mentorUui];
    roomToId[mentorUui] = socket.id;
    if (roomToId[mentorUui]) {
      // console.log("mentor id");
      delete idToRoom[roomToId[mentorUui]];
      idToRoom[socket.id] = mentorUui;

      socket.emit("already have", "data");
    }
  });

  socket.on("after refresh", (payload) => {
    const { roomRef } = payload;

    if (room[roomRef]) {
      room[roomRef].forEach((key) => {
        socket.emit("student want to connect", {
          studentId: UuidToStudentId[key],
        });
      });
    }
  });
  // join section2
  socket.on("student want to connect", async (payload) => {
    const { mentorUuid, studentUuid, scheduleID } = payload;

    if (UuidToStudentId[studentUuid]) {
      delete studentIdToUuid[UuidToStudentId[studentUuid]];
      studentIdToUuid[socket.id] = studentUuid;
      delete UuidToStudentId[studentUuid];
      UuidToStudentId[studentUuid] = socket.id;
      //change
      if (schedule[mentorUuid] == scheduleID) {
        const mentorSocketId = await roomToId?.[mentorUuid];
        io.to(mentorSocketId).emit("student want to connect", {
          studentId: socket.id,
        });
      } else {
        socket.emit("open dialog", "Class has ended....");
      }
    } else {
      if (roomToId[mentorUuid] && schedule[mentorUuid] == scheduleID) {
        UuidToStudentId[studentUuid] = socket.id;
        studentIdToUuid[socket.id] = studentUuid;

        room[mentorUuid].push(studentUuid);
        const mentiId = await roomToId?.[mentorUuid];
        io.to(mentiId).emit("student want to connect", {
          studentId: socket.id,
          studentUuid,
        });
      } else {
        if (roomToId[mentorUuid]) {
          //   socket.emit("open dialog", "Your mentor does not start class..");
          // } else {
          socket.emit("open dialog", "Your mentor busy with other class...");
        } else {
          // console.log(studentIdToUuid[socket.id]);
          socket.emit("open dialog", "Class has not started yet.");
        }
      }
    }
  });
  //signal send
  socket.on("sending signal", (payload) => {
    const { userToSignal, signal, uid } = payload;
    studentConnectedTo[studentIdToUuid[userToSignal]] = uid;
    io.to(userToSignal).emit("mentor send to student", {
      mentorFrontId: socket.id,
      mentorSignal: signal,
      muteStatus: mutedMentor[idToRoom[socket.id]],
      videoStatus: videoMute[idToRoom[socket.id]],
    });
  });
  socket.on("returning signal", (payload) => {
    const { signal, mentorFrontId } = payload;

    io.to(mentorFrontId).emit("student signal to mentor", {
      studentSignal: signal,
      id: socket.id,
    });
  });

  socket.on("video mute status", (payload) => {
    const { cameraStatus, mentorUuid } = payload;
    videoMute[mentorUuid] = cameraStatus;
    //video signal
    if (room[mentorUuid].length >= 1) {
      room[mentorUuid].forEach((studentUUid) => {
        io.to(UuidToStudentId[studentUUid]).emit("video signal", {
          cameraStatus,
        });
      });
    }
  });

  socket.on("mentor mute status", (payload) => {
    const { mute, mentorUuid } = payload;
    mutedMentor[mentorUuid] = mute;
    //video signal
    if (room[mentorUuid].length >= 1) {
      room[mentorUuid].forEach((studentUUid) => {
        io.to(UuidToStudentId[studentUUid]).emit("mute signal", {
          mute,
        });
      });
    }
  });

  //mute end
  socket.on("end meeting", (payload) => {
    const { mentorUUid } = payload;
    // room[mentorId] = [];
    delete idToRoom[socket.id];
    delete roomToId[mentorUUid];
    delete mutedMentor[mentorUUid];
    delete videoMute[mentorUUid];
    delete schedule[mentorUUid]; // for it host leave card not display

    if (room[mentorUUid]) {
      room[mentorUUid].forEach((studentUuid) => {
        io.to(UuidToStudentId[studentUuid]).emit(
          "connected host leave",
          "data"
        );
        // delete studentIdToUuid[UuidToStudentId[studentUuid]];
        // delete UuidToStudentId[studentUuid];
      });
      delete room[mentorUUid];
    }
    // socket.emit("mentor want to upload video", recordRaw[mentorUUid]);
  });
  socket.on("Student exit himself", (payload) => {
    const { studentUid } = payload;
    if (UuidToStudentId[studentUid]) {
      delete studentIdToUuid[UuidToStudentId[studentUid]];
      delete UuidToStudentId[studentUid];
    }
  });
  socket.on("host take leave it clint side action", (payload) => {
    const { studentUuid } = payload;
    delete studentIdToUuid[socket.id];
    delete UuidToStudentId[studentUuid];
  });
  socket.on("student leave the meeting", (payload) => {
    const { studentId, mentorUuid, tempMessage } = payload;
    if (room[mentorUuid]) {
      const afterLeave = room[mentorUuid].filter((user) => user !== studentId);
      room[mentorUuid] = afterLeave;
      const mentorSocketId = roomToId[mentorUuid];
      io.to(mentorSocketId).emit("one student leave", {
        studentIdUuid: studentId,
        tempMessage,
      });
      delete studentIdToUuid[socket.id];
      delete UuidToStudentId[studentId];
    }
  });
  //message
  socket.on("send message to student", (payload) => {
    const { tempMessage } = payload; //uuid, message
    if (room[tempMessage.uuid].length >= 1) {
      room[tempMessage.uuid].forEach((studentUuid) => {
        if (UuidToStudentId[studentUuid]) {
          io.to(UuidToStudentId[studentUuid]).emit("message receive", {
            tempMessage,
          });
        }
      });
    }
  });
  socket.on("send message to all", (payload) => {
    const { tempMessage, mentorUuid } = payload;

    if (room[mentorUuid]) {
      io.to(roomToId[mentorUuid]).emit("one of the student send message", {
        tempMessage,
      });
    }
  });
  socket.on("send to other", (payload) => {
    const { tempMessage, mentorUuid } = payload;
    if (room[mentorUuid].length > 1) {
      const exceptSender = room[mentorUuid].filter(
        (studentUuid) => studentUuid !== tempMessage.uuid
      );
      exceptSender.forEach((studentUuid) => {
        io.to(UuidToStudentId[studentUuid]).emit(
          "all student get other student data",
          { tempMessage }
        );
      });
    }
  });
  //message end
  //record video start

  socket.on("record start", (payload) => {
    socket.emit("record", "data");
  });
  socket.on("stop record", (payload) => {
    socket.emit("record stop", "data");
  });
  //recording raw data
  socket.on("recording raw data", (payload) => {
    const { record, mentor } = payload;
    if (recordRaw[mentor]) {
      recordRaw[mentor] = [...recordRaw[mentor], record];
    } else {
      recordRaw[mentor] = [record];
    }
    // console.log(mentor);
  });
  socket.on("save in cloud", (payload) => {
    const { mentorUid } = payload;
    //storage
    console.log(recordRaw[mentorUid]);
  });
  //end Video

  //disconnect part
  socket.on("disconnect", () => {
    if (room[idToRoom[socket.id]]) {
      const mentorUid = idToRoom?.[socket.id];
      const roomTempData = room[mentorUid];
      //clear data from var
      // delete idToRoom[socket.id];
      // if i comment out then refresh will work
      // delete room[mentorUid];
      // delete roomToId[mentorUid];
      // delete mutedMentor[mentorUid];
      // delete videoMute[mentorUid];
      //may be it create issues
      roomTempData.forEach((user) => {
        const studentSocketId = UuidToStudentId?.[user];
        // console.log(studentSocketId);
        io.to(studentSocketId).emit("connected host leave", "data");
      });
      socket.broadcast.emit("send class already exit", {
        roomToId,
      });
    } else if (studentIdToUuid[socket.id]) {
      const studentIdUuid = studentIdToUuid[socket.id];
      const mentorUuid = studentConnectedTo[studentIdUuid];

      if (room[mentorUuid]) {
        const haveIn = room[mentorUuid].filter((id) => id !== studentIdUuid);
        room[mentorUuid] = haveIn;
      }
      delete UuidToStudentId[studentIdUuid];
      delete studentIdToUuid[socket.id];
      delete studentConnectedTo[studentIdUuid];
      io.to(roomToId[mentorUuid]).emit("one student leave", { studentIdUuid });
    }
  });
});

//live stream 2
const mentorArray = {};
const streamMentorUidToSoId = {};
const streamMentorSoIdToUid = {};
//USER
const streamUserUidToSoId = {};
const streamUserSoIdToUid = {};
const streamUserConnectedTo = {}; //It manipulation when mentor connected..

io.of("/stream").on("connection", (socket) => {
  // try {
  //user first time join
  socket.on("joining request send", (payload) => {
    try {
      const { mentorId, userId } = payload;
      if (mentorArray[mentorId]) {
        //mentor is present
        streamUserUidToSoId[userId] = socket.id;
        streamUserSoIdToUid[socket.id] = userId;
        streamUserConnectedTo[userId] = mentorId;
        const checkUserHave = mentorArray?.[mentorId];
        if (checkUserHave && checkUserHave.length > 0) {
          const have = checkUserHave.find((id) => id === userId);
          if (have) {
            const witdraw = checkUserHave.filter(
              (userData) => userData !== userId
            );
            mentorArray[mentorId] = witdraw;
            mentorArray?.[mentorId].push(userId);
          } else {
            mentorArray[mentorId].push(userId);
          }
        } else {
          mentorArray[mentorId].push(userId);
        }

        // console.log(streamMentorUidToSoId[mentorId]);
        const check = streamMentorUidToSoId[mentorId];
        socket.to(check).emit("send for create peer", {
          userUid: userId,
        }); //to mentor
      } else {
        socket.emit("mentor does not start the class", "data");

        //mentor is not present then user no data is recorded
      }
    } catch (error) {
      next(error);
    }
  });

  //mentor first time join
  socket.on("Mentor join", (payload) => {
    try {
      const { mentorId } = payload;
      mentorArray[mentorId] = []; //initialize empty array
      streamMentorUidToSoId[mentorId] = socket.id;
      streamMentorSoIdToUid[socket.id] = mentorId;
    } catch (error) {
      console.log(error);
      next(error);
    }

    // console.log(socket.id);
  });

  socket.on("disconnect", () => {
    //user disconnect
    try {
      if (streamUserSoIdToUid[socket.id]) {
        const userUid = streamUserSoIdToUid?.[socket.id];
        delete streamUserUidToSoId[streamUserSoIdToUid[socket.id]];

        const mentorUid =
          streamUserConnectedTo?.[streamUserSoIdToUid?.[socket.id]];
        delete streamUserConnectedTo[streamUserSoIdToUid[socket.id]];
        //through above we can reach at mentor
        delete streamUserSoIdToUid[socket.id];
        socket.to(streamMentorUidToSoId?.[mentorUid]).emit("one user leave", {
          userUid,
        });
        //mentor disconnect below
      } else if (streamMentorSoIdToUid[socket.id]) {
        // for mentor
        const mentorUid = streamMentorSoIdToUid[socket.id];
        delete streamMentorUidToSoId[mentorUid];
        delete streamMentorSoIdToUid[socket.id];
        const allUser = mentorArray[mentorUid];
        delete mentorArray[mentorUid];
        console.log(allUser);
        if (allUser && allUser.length > 0) {
          allUser?.forEach((user) => {
            if (streamUserConnectedTo[user]) {
              delete streamUserConnectedTo[user];
            }
            socket.to(streamUserUidToSoId[user]).emit("mentor take leave");
          });
          //"allUser" send to all user mentor disconnected..
        }
      }
    } catch (error) {
      next(error);
    }
  });

  //signal exchange start from mentor

  socket.on("Mentor send signal", (payload) => {
    try {
      const { sendTo, signalData, classDetails } = payload;
      // console.log(classDetails);
      socket.to(streamUserUidToSoId[sendTo]).emit("send to user", {
        mentorSignal: signalData,
        classDetails,
      });
    } catch (error) {
      next(error);
    }
  });

  socket.on("User send signal to mentor", (payload) => {
    try {
      const { signal, mentorUid } = payload;
      socket
        .to(streamMentorUidToSoId[mentorUid])
        .emit("mentor get return signal", {
          userSignal: signal,
          user: streamUserSoIdToUid[socket.id],
        });
    } catch (error) {
      next(error);
    }
  });

  //mentor leave
  socket.on("mentor leave the class", (payload) => {
    try {
      const { mentorUid } = payload;
      const allUser = mentorArray?.[mentorUid];
      delete mentorArray[mentorUid];
      delete streamMentorUidToSoId[mentorUid];
      delete streamMentorSoIdToUid[socket.id];
      if (allUser && allUser.length > 0) {
        allUser.forEach((user) => {
          if (streamUserConnectedTo[user]) {
            delete streamUserConnectedTo[user];
          }
          socket.to(streamUserUidToSoId[user]).emit("mentor leave", "leave");
        });
      }
    } catch (error) {
      next(error);
    }
  });
  // mentor mute status
  socket.on("mentor_video_mute", (payload) => {
    try {
      const { videoMuteStatus, mentorUid } = payload;
      //  const usersList =  mentorArray?.[mentorUid]
      if (mentorArray[mentorUid] && mentorArray[mentorUid].length > 0) {
        mentorArray[mentorUid]?.forEach((user) => {
          const singleUser = streamUserUidToSoId?.[user];
          socket
            .to(singleUser)
            .emit("video_status_send_user", { videoMuteStatus });
        });
      }
    } catch (error) {
      next(error);
    }
  });
  socket.on("mentor_mute_mic", (payload) => {
    try {
      const { micStatus, mentorUid } = payload;
      //  const usersList =  mentorArray?.[mentorUid]
      if (mentorArray[mentorUid] && mentorArray[mentorUid].length > 0) {
        mentorArray[mentorUid]?.forEach((user) => {
          const singleUser = streamUserUidToSoId?.[user];
          socket.to(singleUser).emit("mic_status_send_user", { micStatus });
        });
      }
    } catch (error) {
      next(error);
    }
  });
  //user leave
  socket.on("User leave", (payload) => {
    try {
      const { userUid } = payload;
      if (streamUserConnectedTo[userUid]) {
        //mentor to signal end
        delete streamUserUidToSoId[userUid];
        delete streamUserSoIdToUid[socket.id];
        const mentorUid = streamUserConnectedTo[userUid];
        delete streamUserConnectedTo[userUid];
        const menArray = mentorArray?.[mentorUid];
        if (menArray && menArray.length > 0) {
          const exitInArray = menArray.filter((data) => data !== userUid);
          mentorArray[mentorUid] = exitInArray;
        }
        socket
          .to(streamMentorUidToSoId[mentorUid])
          .emit("one user leave", { userUid });
      } else {
        delete streamUserUidToSoId[userUid];
        delete streamUserSoIdToUid[socket.id];
      }
    } catch (error) {
      next(error);
    }
  });

  // messaging center

  socket.on("mentor send message", (payload) => {
    try {
      const { message, userSelf, senderName } = payload;
      const allUser = mentorArray?.[userSelf];
      if (allUser && allUser.length > 0) {
        allUser.forEach((user) => {
          socket.to(streamUserUidToSoId[user]).emit("message send by mentor", {
            message,
            userSelf,
            senderName,
          });
        });
      }
    } catch (error) {
      next(error);
    }
  });

  socket.on("user send message", (payload) => {
    try {
      const { message, userSelf, mentorUid, senderName } = payload;
      const allUser = mentorArray?.[mentorUid];
      if (allUser && allUser.length > 0) {
        const exceptHimSelf = allUser.filter((id) => id !== userSelf);
        exceptHimSelf.push(mentorUid);
        exceptHimSelf.forEach((userMentor) => {
          if (userMentor === mentorUid) {
            socket
              .to(streamMentorUidToSoId[mentorUid])
              .emit("user send to mentor", {
                message,
                userSelf,
                senderName,
              });
          } else {
            socket
              .to(streamUserUidToSoId[userMentor])
              .emit("user send to other user", {
                message,
                userSelf,
                senderName,
              });
          }
        });
      }
    } catch (error) {
      next(error);
    }
  });

  // }
  // catch (error) {
  //   console.log(error);
  // }
});

//for mail route
// checkout
app.post("/mail", async (req, res, next) => {
  try {
    const { displayFromSideName, toEmail, body, subject, cc, bcc } = req.body;

    if (toEmail.length < 1)
      throw createError.BadRequest("You have to enter sender email... ");
    //mail property
    let transport = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "noreply.itqanuae@gmail.com",
        pass: "itqan@2021",
      },
    });
    //mail option
    const mailOption = {
      from: `${displayFromSideName} <foo@example.com>`,
      to: toEmail,
      subject: subject,
      text: body,
      cc,
      bcc,
    };
    const send = await transport.sendMail(mailOption);
    //mail option end
    //mail end
    res.send({ data: send });
  } catch (error) {
    next(error);
  }
});
//check

//mail route

//register route
// app.post("/register");

//register rote end
//error handel
app.use(async (req, res, next) => {
  next(createError.NotFound());
});

app.use((err, req, res, next) => {
  res.status(err.status || 400);
  res.send({
    error: {
      status: err.status || 400,
      message: err.message,
    },
  });
});

server.listen(process.env.PORT || 4000, () => {
  console.log("The port 4000 is ready to start....");
});
