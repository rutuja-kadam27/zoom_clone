import { Server } from "socket.io"


let connections = {}
let messages = {}
let timeOnline = {}

export const connectToSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
            allowedHeaders: ["*"],
            credentials: true
        }
    });


    io.on("connection", (socket) => {

        console.log("SOMETHING CONNECTED")

        socket.on("join-call", (path) => {

            if (connections[path] === undefined) {
                connections[path] = []
            }
            connections[path].push(socket.id)

            timeOnline[socket.id] = new Date();

            // connections[path].forEach(elem => {
            //     io.to(elem)
            // })

            for (let a = 0; a < connections[path].length; a++) {
                io.to(connections[path][a]).emit("user-joined", socket.id, connections[path])
            }

            if (messages[path] !== undefined) {
                for (let a = 0; a < messages[path].length; ++a) {
                    io.to(socket.id).emit("chat-message", messages[path][a]['data'],
                        messages[path][a]['sender'], messages[path][a]['socket-id-sender'])
                }
            }

        })

        socket.on("signal", (toId, message) => {
            io.to(toId).emit("signal", socket.id, message);
        })

        socket.on("chat-message", (data, sender) => {

            const [matchingRoom, found] = Object.entries(connections)
                .reduce(([room, isFound], [roomKey, roomValue]) => {


                    if (!isFound && roomValue.includes(socket.id)) {
                        return [roomKey, true];
                    }

                    return [room, isFound];

                }, ['', false]);

            if (found === true) {
                if (messages[matchingRoom] === undefined) {
                    messages[matchingRoom] = []
                }

                messages[matchingRoom].push({ 'sender': sender, "data": data, "socket-id-sender": socket.id })
                console.log("message", matchingRoom, ":", sender, data)

                connections[matchingRoom].forEach((elem) => {
                    io.to(elem).emit("chat-message", data, sender, socket.id)
                })
            }

        })

        socket.on("user-action", (actionType, value) => {
            // Find the room this socket is in and broadcast the action to others
            for (const [roomKey, socketIds] of Object.entries(connections)) {
                if (socketIds.includes(socket.id)) {
                    socketIds.forEach((id) => {
                        if (id !== socket.id) {
                            io.to(id).emit("user-action", socket.id, actionType, value);
                        }
                    });
                }
            }
        })

        socket.on("disconnect", () => {
            console.log("CLIENT DISCONNECTED:", socket.id);
            
            for (const [roomKey, socketIds] of Object.entries(connections)) {
                if (socketIds.includes(socket.id)) {
                    // Notify other users in the room that this user left
                    socketIds.forEach((id) => {
                        if (id !== socket.id) {
                            io.to(id).emit("user-left", socket.id);
                        }
                    });

                    // Remove the user from the connections array
                    connections[roomKey] = socketIds.filter((id) => id !== socket.id);

                    // If the room is now empty, delete it
                    if (connections[roomKey].length === 0) {
                        delete connections[roomKey];
                    }
                }
            }

            delete timeOnline[socket.id];
        })


    })


    return io;
}
