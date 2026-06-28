import React, { useEffect, useRef, useState } from 'react'
import io from "socket.io-client";
import { Badge, IconButton, TextField, Button, Paper, Typography, Box, CircularProgress } from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff'
import CallEndIcon from '@mui/icons-material/CallEnd'
import MicIcon from '@mui/icons-material/Mic'
import MicOffIcon from '@mui/icons-material/MicOff'
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare'
import ChatIcon from '@mui/icons-material/Chat'
import SendIcon from '@mui/icons-material/Send';
import PersonIcon from '@mui/icons-material/Person';
import styles from "../styles/videoComponent.module.css";
import server from '../environment';

const server_url = server;

const peerConfigConnections = {
    "iceServers": [
        { "urls": "stun:stun.l.google.com:19302" },
        { "urls": "stun:stun1.l.google.com:19302" }
    ]
}

export default function VideoMeetComponent() {
    const socketRef = useRef(null);
    const socketIdRef = useRef(null);
    const connectionsRef = useRef({});
    const localVideoref = useRef(null);
    const screenStreamRef = useRef(null);

    const [videoAvailable, setVideoAvailable] = useState(true);
    const [audioAvailable, setAudioAvailable] = useState(true);
    const [video, setVideo] = useState(true);
    const [audio, setAudio] = useState(true);
    const [screen, setScreen] = useState(false);
    const [screenAvailable, setScreenAvailable] = useState(false);
    
    const [showModal, setModal] = useState(false);
    const [messages, setMessages] = useState([]);
    const [message, setMessage] = useState("");
    const [newMessages, setNewMessages] = useState(0);
    
    const [askForUsername, setAskForUsername] = useState(true);
    const [username, setUsername] = useState("");
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(false);

    // Get permissions and setup local stream on mount
    useEffect(() => {
        getPermissions();

        return () => {
            // Clean up everything on unmount
            cleanupCall();
        };
    }, []);

    const cleanupCall = () => {
        console.log("Cleaning up call...");
        if (socketRef.current) {
            socketRef.current.disconnect();
        }
        if (window.localStream) {
            window.localStream.getTracks().forEach(track => track.stop());
            window.localStream = null;
        }
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(track => track.stop());
            screenStreamRef.current = null;
        }
        for (let id in connectionsRef.current) {
            if (connectionsRef.current[id]) {
                connectionsRef.current[id].close();
            }
        }
        connectionsRef.current = {};
    };

    const createFallbackStream = () => {
        console.log("Creating fallback black/silent stream");
        const blackTrack = createBlackVideoTrack();
        const silenceTrack = createSilenceAudioTrack();
        const fallbackStream = new MediaStream([blackTrack, silenceTrack]);
        window.localStream = fallbackStream;
        if (localVideoref.current) {
            localVideoref.current.srcObject = fallbackStream;
        }
    };

    const createSilenceAudioTrack = () => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = ctx.createOscillator();
            const dst = oscillator.connect(ctx.createMediaStreamDestination());
            oscillator.start();
            ctx.resume();
            const track = dst.stream.getAudioTracks()[0];
            track.enabled = false;
            return track;
        } catch (e) {
            console.error("Failed to create silent audio track:", e);
            // Fallback to undefined/null or empty track if possible
            return null;
        }
    };

    const createBlackVideoTrack = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = "#111827";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw initials or placeholder text
        ctx.fillStyle = "#ffffff";
        ctx.font = "30px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Camera Off", canvas.width / 2, canvas.height / 2);

        const stream = canvas.captureStream(10); // 10 fps is plenty for static black
        const track = stream.getVideoTracks()[0];
        track.enabled = false;
        return track;
    };

    const getPermissions = async () => {
        setLoading(true);
        try {
            // Request both video and audio together (standard practice)
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            window.localStream = stream;
            if (localVideoref.current) {
                localVideoref.current.srcObject = stream;
            }
            setVideoAvailable(true);
            setAudioAvailable(true);
            setVideo(true);
            setAudio(true);
            console.log('Camera and Microphone permissions granted');
        } catch (err) {
            console.warn('Failed to get both video and audio, trying individually...', err);
            
            let hasVideo = false;
            let hasAudio = false;

            // Try video only
            try {
                const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
                videoStream.getTracks().forEach(track => track.stop());
                hasVideo = true;
                setVideoAvailable(true);
                setVideo(true);
                console.log('Camera permission granted');
            } catch (videoErr) {
                hasVideo = false;
                setVideoAvailable(false);
                setVideo(false);
                console.log('Camera permission denied or unavailable', videoErr);
            }

            // Try audio only
            try {
                const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                audioStream.getTracks().forEach(track => track.stop());
                hasAudio = true;
                setAudioAvailable(true);
                setAudio(true);
                console.log('Microphone permission granted');
            } catch (audioErr) {
                hasAudio = false;
                setAudioAvailable(false);
                setAudio(false);
                console.log('Microphone permission denied or unavailable', audioErr);
            }

            // Open the stream with whatever is available
            try {
                if (hasVideo || hasAudio) {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: hasVideo,
                        audio: hasAudio
                    });
                    window.localStream = stream;
                    if (localVideoref.current) {
                        localVideoref.current.srcObject = stream;
                    }
                } else {
                    createFallbackStream();
                }
            } catch (fallbackErr) {
                console.error('Error opening media stream:', fallbackErr);
                createFallbackStream();
            }
        } finally {
            setLoading(false);
        }

        // Check if screen sharing is supported
        if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
            setScreenAvailable(true);
        } else {
            setScreenAvailable(false);
        }
    };

    const connect = () => {
        if (!username.trim()) {
            alert("Please enter a username");
            return;
        }
        setAskForUsername(false);
        connectToSocketServer();
    };

    const initializePeerConnection = (socketListId) => {
        console.log("Initializing peer connection for:", socketListId);
        const pc = new RTCPeerConnection(peerConfigConnections);
        
        // Store in ref
        connectionsRef.current[socketListId] = pc;

        // Queue for ICE candidates that arrive before remote description is set
        pc.iceQueue = [];

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socketRef.current.emit('signal', socketListId, JSON.stringify({ 'ice': event.candidate }));
            }
        };

        // Handle remote stream tracks
        pc.ontrack = (event) => {
            console.log("Received remote track from:", socketListId, event.streams);
            const remoteStream = event.streams[0];

            setVideos((prevVideos) => {
                const videoExists = prevVideos.find(v => v.socketId === socketListId);
                if (videoExists) {
                    return prevVideos.map(v => 
                        v.socketId === socketListId ? { ...v, stream: remoteStream } : v
                    );
                } else {
                    return [...prevVideos, {
                        socketId: socketListId,
                        stream: remoteStream,
                        autoplay: true,
                        playsinline: true
                    }];
                }
            });
        };

        // Add local tracks to the connection
        if (window.localStream) {
            window.localStream.getTracks().forEach(track => {
                pc.addTrack(track, window.localStream);
            });
        }

        return pc;
    };

    const gotMessageFromServer = (fromId, message) => {
        let signal;
        try {
            signal = JSON.parse(message);
        } catch (e) {
            console.error("Failed to parse signaling message:", e);
            return;
        }

        if (fromId === socketIdRef.current) return;

        let pc = connectionsRef.current[fromId];
        if (!pc) {
            pc = initializePeerConnection(fromId);
        }

        if (signal.sdp) {
            pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
                .then(() => {
                    console.log("Remote description set successfully for:", fromId);
                    
                    // Process any queued ICE candidates
                    if (pc.iceQueue && pc.iceQueue.length > 0) {
                        pc.iceQueue.forEach(candidate => {
                            pc.addIceCandidate(new RTCIceCandidate(candidate))
                                .catch(e => console.error("Error adding queued ICE candidate:", e));
                        });
                        pc.iceQueue = [];
                    }

                    if (signal.sdp.type === 'offer') {
                        pc.createAnswer().then((description) => {
                            pc.setLocalDescription(description).then(() => {
                                socketRef.current.emit('signal', fromId, JSON.stringify({ 'sdp': pc.localDescription }));
                            }).catch(e => console.error("Error setting local description:", e));
                        }).catch(e => console.error("Error creating answer:", e));
                    }
                })
                .catch(e => console.error("Error setting remote description:", e));
        }

        if (signal.ice) {
            const candidate = new RTCIceCandidate(signal.ice);
            if (pc.remoteDescription) {
                pc.addIceCandidate(candidate)
                    .catch(e => console.error("Error adding ICE candidate:", e));
            } else {
                // Buffer the candidate
                if (!pc.iceQueue) {
                    pc.iceQueue = [];
                }
                pc.iceQueue.push(signal.ice);
                console.log("Buffered ICE candidate for:", fromId);
            }
        }
    };

    const connectToSocketServer = () => {
        // Connect to Socket.io server
        socketRef.current = io.connect(server_url, {
            secure: server_url.startsWith("https"),
            rejectUnauthorized: false
        });

        socketRef.current.on('signal', gotMessageFromServer);

        socketRef.current.on('connect', () => {
            console.log("Connected to signaling server. Socket ID:", socketRef.current.id);
            socketIdRef.current = socketRef.current.id;

            // Join the call room
            socketRef.current.emit('join-call', window.location.href);

            socketRef.current.on('chat-message', addMessage);

            socketRef.current.on('user-left', (id) => {
                console.log("User left:", id);
                setVideos((prevVideos) => prevVideos.filter((v) => v.socketId !== id));
                if (connectionsRef.current[id]) {
                    connectionsRef.current[id].close();
                    delete connectionsRef.current[id];
                }
            });

            socketRef.current.on('user-joined', (joinedUserId, allClients) => {
                console.log("User joined notification. Joined ID:", joinedUserId, "All clients:", allClients);

                if (joinedUserId === socketIdRef.current) {
                    // We are the new user. We must initiate connections to all existing clients.
                    allClients.forEach((socketListId) => {
                        if (socketListId === socketIdRef.current) return;
                        if (connectionsRef.current[socketListId]) return; // Already connected

                        const pc = initializePeerConnection(socketListId);

                        // Create and send offer
                        pc.createOffer().then((description) => {
                            pc.setLocalDescription(description).then(() => {
                                socketRef.current.emit('signal', socketListId, JSON.stringify({ 'sdp': pc.localDescription }));
                            }).catch(e => console.error("Error setting local description:", e));
                        }).catch(e => console.error("Error creating offer:", e));
                    });
                } else {
                    // Someone else joined. We only create a peer connection for them and wait for their offer.
                    if (!connectionsRef.current[joinedUserId]) {
                        initializePeerConnection(joinedUserId);
                    }
                }
            });
        });
    };

    const handleVideo = () => {
        const nextVideoState = !video;
        setVideo(nextVideoState);
        if (window.localStream) {
            window.localStream.getVideoTracks().forEach(track => {
                track.enabled = nextVideoState;
            });
        }
    };

    const handleAudio = () => {
        const nextAudioState = !audio;
        setAudio(nextAudioState);
        if (window.localStream) {
            window.localStream.getAudioTracks().forEach(track => {
                track.enabled = nextAudioState;
            });
        }
    };

    const handleScreen = async () => {
        if (!screen) {
            // Start screen sharing
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
                screenStreamRef.current = stream;
                const screenTrack = stream.getVideoTracks()[0];

                // Replace track on all peer connections
                for (let id in connectionsRef.current) {
                    const pc = connectionsRef.current[id];
                    const senders = pc.getSenders();
                    const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                    if (videoSender) {
                        videoSender.replaceTrack(screenTrack);
                    }
                }

                // Update local video view (we keep showing camera to prevent infinite mirror)

                // When screen share ends via browser UI
                screenTrack.onended = () => {
                    stopScreenShare();
                };

                setScreen(true);
            } catch (e) {
                console.error("Error starting screen share:", e);
            }
        } else {
            stopScreenShare();
        }
    };

    const stopScreenShare = () => {
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(track => track.stop());
            screenStreamRef.current = null;
        }

        // Restore camera track on all connections
        const cameraTrack = window.localStream ? window.localStream.getVideoTracks()[0] : null;
        if (cameraTrack) {
            for (let id in connectionsRef.current) {
                const pc = connectionsRef.current[id];
                const senders = pc.getSenders();
                const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                if (videoSender) {
                    videoSender.replaceTrack(cameraTrack);
                }
            }
        }

        // Restore local video view (already showing camera)

        setScreen(false);
    };

    const handleEndCall = () => {
        cleanupCall();
        window.location.href = "/home";
    };

    const addMessage = (data, sender, socketIdSender) => {
        setMessages((prevMessages) => [
            ...prevMessages,
            { sender: sender, data: data, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
        ]);
        if (socketIdSender !== socketIdRef.current) {
            setNewMessages((prev) => prev + 1);
        }
    };

    const sendMessage = () => {
        if (!message.trim()) return;
        if (socketRef.current) {
            socketRef.current.emit('chat-message', message, username);
            setMessage("");
        }
    };

    const toggleChat = () => {
        setModal(!showModal);
        if (!showModal) {
            setNewMessages(0);
        }
    };

    return (
        <Box className={styles.meetVideoContainer}>
            {askForUsername ? (
                // LOBBY UI
                <Box className={styles.lobbyContainer}>
                    <Paper elevation={12} className={styles.lobbyCard}>
                        <Typography variant="h4" className={styles.lobbyTitle}>
                            Ready to Join?
                        </Typography>
                        
                        <Box className={styles.lobbyPreviewContainer}>
                            {loading ? (
                                <Box className={styles.lobbyLoading}>
                                    <CircularProgress color="primary" />
                                    <Typography sx={{ mt: 2, color: '#9ca3af' }}>
                                        Setting up media devices...
                                    </Typography>
                                </Box>
                            ) : (
                                <video
                                    ref={(ref) => {
                                        localVideoref.current = ref;
                                        if (ref && window.localStream) {
                                            ref.srcObject = window.localStream;
                                        }
                                    }}
                                    className={styles.lobbyVideo}
                                    autoPlay
                                    muted
                                ></video>
                            )}
                            
                            <Box className={styles.lobbyMediaIndicators}>
                                {videoAvailable ? (
                                    <Badge color="success" variant="dot" />
                                ) : (
                                    <Badge color="error" variant="dot" />
                                )}
                                <Typography variant="caption" sx={{ ml: 1, color: '#e5e7eb' }}>
                                    Camera: {videoAvailable ? 'Available' : 'Unavailable'}
                                </Typography>
                                
                                <Box sx={{ mx: 2 }} />
                                
                                {audioAvailable ? (
                                    <Badge color="success" variant="dot" />
                                ) : (
                                    <Badge color="error" variant="dot" />
                                )}
                                <Typography variant="caption" sx={{ ml: 1, color: '#e5e7eb' }}>
                                    Mic: {audioAvailable ? 'Available' : 'Unavailable'}
                                </Typography>
                            </Box>
                        </Box>

                        <Box className={styles.lobbyForm}>
                            <TextField
                                fullWidth
                                label="Enter your name"
                                variant="outlined"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className={styles.lobbyInput}
                                InputProps={{
                                    style: { color: 'white' }
                                }}
                                InputLabelProps={{
                                    style: { color: '#9ca3af' }
                                }}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') connect();
                                }}
                            />
                            <Button
                                fullWidth
                                variant="contained"
                                onClick={connect}
                                className={styles.lobbyButton}
                            >
                                Join Meeting
                            </Button>
                        </Box>
                    </Paper>
                </Box>
            ) : (
                // MEETING CALL UI
                <Box className={styles.mainCallLayout}>
                    {/* Video Conference Area */}
                    <Box className={styles.videoWorkspace}>
                        <Box className={styles.videoGrid}>
                            {/* Local Video Card */}
                            <Box className={styles.videoCard}>
                                <video
                                    ref={(ref) => {
                                        localVideoref.current = ref;
                                        if (ref && window.localStream) {
                                            ref.srcObject = window.localStream;
                                        }
                                    }}
                                    className={styles.videoElement}
                                    autoPlay
                                    muted
                                ></video>
                                <Box className={styles.videoLabel}>
                                    <PersonIcon fontSize="small" sx={{ mr: 0.5 }} />
                                    <Typography variant="body2">{username} (You)</Typography>
                                </Box>
                                {!video && (
                                    <Box className={styles.videoMutedOverlay}>
                                        <Typography variant="h6">{username.substring(0,2).toUpperCase()}</Typography>
                                    </Box>
                                )}
                                {screen && (
                                    <Box className={styles.screenShareOverlay}>
                                        <ScreenShareIcon sx={{ fontSize: '3rem', color: '#ff9839', mb: 1 }} />
                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>You are presenting</Typography>
                                    </Box>
                                )}
                            </Box>

                            {/* Remote Participant Videos */}
                            {videos.map((vid) => (
                                <Box className={styles.videoCard} key={vid.socketId}>
                                    <video
                                        data-socket={vid.socketId}
                                        ref={(ref) => {
                                            if (ref && vid.stream) {
                                                ref.srcObject = vid.stream;
                                            }
                                        }}
                                        className={styles.videoElement}
                                        autoPlay
                                        playsInline
                                    ></video>
                                    <Box className={styles.videoLabel}>
                                        <PersonIcon fontSize="small" sx={{ mr: 0.5 }} />
                                        <Typography variant="body2">Participant ({vid.socketId.substring(0, 4)})</Typography>
                                    </Box>
                                </Box>
                            ))}
                        </Box>
                    </Box>

                    {/* Floating Controls Dock */}
                    <Box className={styles.controlsDock}>
                        <IconButton 
                            onClick={handleVideo} 
                            className={`${styles.controlBtn} ${!video ? styles.btnMuted : ''}`}
                        >
                            {video ? <VideocamIcon /> : <VideocamOffIcon />}
                        </IconButton>
                        
                        <IconButton 
                            onClick={handleAudio} 
                            className={`${styles.controlBtn} ${!audio ? styles.btnMuted : ''}`}
                        >
                            {audio ? <MicIcon /> : <MicOffIcon />}
                        </IconButton>

                        {screenAvailable && (
                            <IconButton 
                                onClick={handleScreen} 
                                className={`${styles.controlBtn} ${screen ? styles.btnActive : ''}`}
                            >
                                {screen ? <StopScreenShareIcon /> : <ScreenShareIcon />}
                            </IconButton>
                        )}

                        <Badge badgeContent={newMessages} color="error" max={99}>
                            <IconButton 
                                onClick={toggleChat} 
                                className={`${styles.controlBtn} ${showModal ? styles.btnActive : ''}`}
                            >
                                <ChatIcon />
                            </IconButton>
                        </Badge>

                        <IconButton 
                            onClick={handleEndCall} 
                            className={`${styles.controlBtn} ${styles.btnHangup}`}
                        >
                            <CallEndIcon />
                        </IconButton>
                    </Box>

                    {/* Sliding Chat Drawer */}
                    {showModal && (
                        <Box className={styles.chatDrawer}>
                            <Box className={styles.chatHeader}>
                                <Typography variant="h6">Meeting Chat</Typography>
                                <IconButton onClick={toggleChat} sx={{ color: 'white' }}>
                                    <span style={{ fontSize: '1.2rem' }}>&times;</span>
                                </IconButton>
                            </Box>

                            <Box className={styles.chatMessageList}>
                                {messages.length > 0 ? (
                                    messages.map((item, index) => {
                                        const isSelf = item.sender === username;
                                        return (
                                            <Box 
                                                key={index} 
                                                className={`${styles.chatBubbleContainer} ${isSelf ? styles.bubbleSelf : styles.bubbleOther}`}
                                            >
                                                <Typography variant="caption" className={styles.chatBubbleSender}>
                                                    {item.sender} • {item.time}
                                                </Typography>
                                                <Paper className={styles.chatBubble}>
                                                    <Typography variant="body2">{item.data}</Typography>
                                                </Paper>
                                            </Box>
                                        );
                                    })
                                ) : (
                                    <Box className={styles.chatEmptyState}>
                                        <Typography variant="body2" color="textSecondary">
                                            No messages yet. Say hello!
                                        </Typography>
                                    </Box>
                                )}
                            </Box>

                            <Box className={styles.chatInputArea}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    placeholder="Type a message..."
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter') sendMessage();
                                    }}
                                    className={styles.chatInput}
                                    InputProps={{
                                        style: { color: 'white' }
                                    }}
                                />
                                <IconButton onClick={sendMessage} className={styles.chatSendBtn}>
                                    <SendIcon />
                                </IconButton>
                            </Box>
                        </Box>
                    )}
                </Box>
            )}
        </Box>
    );
}