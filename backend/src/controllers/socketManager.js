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
        console.log(`[Backend] Socket connected: ${socket.id}`);

        socket.on("join-call", (meetingCode) => {
            console.log(`[Backend] User ${socket.id} joining meeting: ${meetingCode}`);

            if (connections[meetingCode] === undefined) {
                connections[meetingCode] = [];
            }
            
            // Prevent duplicate socket IDs in the room list
            if (!connections[meetingCode].includes(socket.id)) {
                connections[meetingCode].push(socket.id);
            }

            timeOnline[socket.id] = new Date();

            // Notify all clients in the room (including the joining client) about the updated participant list
            for (let a = 0; a < connections[meetingCode].length; a++) {
                io.to(connections[meetingCode][a]).emit("user-joined", socket.id, connections[meetingCode]);
            }

            // Sync chat history for the new participant
            if (messages[meetingCode] !== undefined) {
                for (let a = 0; a < messages[meetingCode].length; ++a) {
                    io.to(socket.id).emit("chat-message", messages[meetingCode][a]['data'],
                        messages[meetingCode][a]['sender'], messages[meetingCode][a]['socket-id-sender']);
                }
            }
        });

        socket.on("signal", (toId, message) => {
            console.log(`[Backend] Routing signal from ${socket.id} to ${toId}`);
            io.to(toId).emit("signal", socket.id, message);
        });

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
                    messages[matchingRoom] = [];
                }

                messages[matchingRoom].push({ 'sender': sender, "data": data, "socket-id-sender": socket.id });
                console.log(`[Backend] Chat Message in ${matchingRoom} from ${sender}: ${data}`);

                connections[matchingRoom].forEach((elem) => {
                    io.to(elem).emit("chat-message", data, sender, socket.id);
                });
            }
        });

        socket.on("user-action", (actionType, value) => {
            console.log(`[Backend] User Action from ${socket.id}: ${actionType} -> ${value}`);
            for (const [roomKey, socketIds] of Object.entries(connections)) {
                if (socketIds.includes(socket.id)) {
                    socketIds.forEach((id) => {
                        if (id !== socket.id) {
                            io.to(id).emit("user-action", socket.id, actionType, value);
                        }
                    });
                }
            }
        });

        socket.on("disconnect", () => {
            console.log(`[Backend] Socket disconnected: ${socket.id}`);
            
            for (const [roomKey, socketIds] of Object.entries(connections)) {
                if (socketIds.includes(socket.id)) {
                    // Remove leaving user from the room list
                    connections[roomKey] = socketIds.filter(id => id !== socket.id);
                    console.log(`[Backend] Removed ${socket.id} from room ${roomKey}. Remaining: ${connections[roomKey].length}`);

                    // Notify remaining users that this participant left
                    connections[roomKey].forEach((id) => {
                        io.to(id).emit("user-left", socket.id);
                    });

                    // Clean up room and messages if the room becomes empty
                    if (connections[roomKey].length === 0) {
                        console.log(`[Backend] Room ${roomKey} is now empty. Cleaning up.`);
                        delete connections[roomKey];
                        delete messages[roomKey];
                    }
                }
            }
            delete timeOnline[socket.id];
        });
    });
};
