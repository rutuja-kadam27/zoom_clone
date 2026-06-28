import React, { useEffect, useRef, useState } from 'react'
import io from "socket.io-client";
import { Badge, IconButton, TextField, Button, Paper, Typography, Box, CircularProgress, Avatar as MuiAvatar } from '@mui/material';
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
import PanToolIcon from '@mui/icons-material/PanTool';
import PeopleIcon from '@mui/icons-material/People';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import TimerIcon from '@mui/icons-material/Timer';
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
    
    // Collaboration Features
    const [handRaised, setHandRaised] = useState(false);
    const [recording, setRecording] = useState(false);
    const [showParticipants, setShowParticipants] = useState(false);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [notifications, setNotifications] = useState([]);
    const [participantsStatus, setParticipantsStatus] = useState({});

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
            cleanupCall();
        };
    }, []);

    // Meeting Timer Effect
    useEffect(() => {
        let timer;
        if (!askForUsername) {
            timer = setInterval(() => {
                setElapsedTime(prev => prev + 1);
            }, 1000);
        }
        return () => {
            if (timer) clearInterval(timer);
        };
    }, [askForUsername]);

    const formatTime = (totalSeconds) => {
        const hrs = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
        const mins = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
        const secs = (totalSeconds % 60).toString().padStart(2, '0');
        return `${hrs}:${mins}:${secs}`;
    };

    // Helper to add self-destructing toast notifications
    const addNotification = (msg, type = 'info') => {
        const id = Date.now() + Math.random().toString(36).substring(2, 9);
        setNotifications(prev => [...prev, { id, message: msg, type }]);
        
        // Auto remove after 4 seconds
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 4000);
    };

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
        
        ctx.fillStyle = "#ffffff";
        ctx.font = "30px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Camera Off", canvas.width / 2, canvas.height / 2);

        const stream = canvas.captureStream(10);
        const track = stream.getVideoTracks()[0];
        track.enabled = false;
        return track;
    };

    const getPermissions = async () => {
        setLoading(true);
        try {
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

            try {
                const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
                videoStream.getTracks().forEach(track => track.stop());
                hasVideo = true;
                setVideoAvailable(true);
                setVideo(true);
            } catch (videoErr) {
                hasVideo = false;
                setVideoAvailable(false);
                setVideo(false);
            }

            try {
                const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                audioStream.getTracks().forEach(track => track.stop());
                hasAudio = true;
                setAudioAvailable(true);
                setAudio(true);
            } catch (audioErr) {
                hasAudio = false;
                setAudioAvailable(false);
                setAudio(false);
            }

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
        
        connectionsRef.current[socketListId] = pc;
        pc.iceQueue = [];

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socketRef.current.emit('signal', socketListId, JSON.stringify({ 'ice': event.candidate }));
            }
        };

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
                if (!pc.iceQueue) {
                    pc.iceQueue = [];
                }
                pc.iceQueue.push(signal.ice);
            }
        }
    };

    const connectToSocketServer = () => {
        socketRef.current = io.connect(server_url, {
            secure: server_url.startsWith("https"),
            rejectUnauthorized: false
        });

        socketRef.current.on('signal', gotMessageFromServer);

        socketRef.current.on('connect', () => {
            console.log("Connected to signaling server. Socket ID:", socketRef.current.id);
            socketIdRef.current = socketRef.current.id;

            socketRef.current.emit('join-call', window.location.href);

            socketRef.current.on('chat-message', addMessage);

            // Sync peer actions (mic, camera, hand, screen, record)
            socketRef.current.on('user-action', (fromId, actionType, value) => {
                setParticipantsStatus(prev => ({
                    ...prev,
                    [fromId]: {
                        ...prev[fromId],
                        [actionType]: value
                    }
                }));

                const userLabel = `Participant (${fromId.substring(0, 4)})`;
                if (actionType === 'audio') {
                    addNotification(`${userLabel} ${value ? 'unmuted' : 'muted'} their mic`, 'info');
                } else if (actionType === 'video') {
                    addNotification(`${userLabel} turned their camera ${value ? 'on' : 'off'}`, 'info');
                } else if (actionType === 'screen') {
                    addNotification(`${userLabel} ${value ? 'started' : 'stopped'} screen sharing`, 'info');
                } else if (actionType === 'raise-hand') {
                    addNotification(`${userLabel} ${value ? 'raised' : 'lowered'} their hand`, 'warning');
                } else if (actionType === 'recording') {
                    addNotification(`${userLabel} ${value ? 'started' : 'stopped'} recording the meeting`, 'error');
                    setRecording(value);
                }
            });

            socketRef.current.on('user-left', (id) => {
                addNotification(`Participant left: ${id.substring(0, 4)}`, 'warning');
                setVideos((prevVideos) => prevVideos.filter((v) => v.socketId !== id));
                setParticipantsStatus(prev => {
                    const next = { ...prev };
                    delete next[id];
                    return next;
                });
                if (connectionsRef.current[id]) {
                    connectionsRef.current[id].close();
                    delete connectionsRef.current[id];
                }
            });

            socketRef.current.on('user-joined', (joinedUserId, allClients) => {
                if (joinedUserId === socketIdRef.current) {
                    addNotification("You joined the meeting", "success");
                    allClients.forEach((socketListId) => {
                        if (socketListId === socketIdRef.current) return;
                        if (connectionsRef.current[socketListId]) return;

                        const pc = initializePeerConnection(socketListId);

                        pc.createOffer().then((description) => {
                            pc.setLocalDescription(description).then(() => {
                                socketRef.current.emit('signal', socketListId, JSON.stringify({ 'sdp': pc.localDescription }));
                            }).catch(e => console.error("Error setting local description:", e));
                        }).catch(e => console.error("Error creating offer:", e));
                    });
                } else {
                    addNotification(`Participant joined: ${joinedUserId.substring(0, 4)}`, 'success');
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
        if (socketRef.current) {
            socketRef.current.emit('user-action', 'video', nextVideoState);
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
        if (socketRef.current) {
            socketRef.current.emit('user-action', 'audio', nextAudioState);
        }
    };

    const handleScreen = async () => {
        if (!screen) {
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
                screenStreamRef.current = stream;
                const screenTrack = stream.getVideoTracks()[0];

                for (let id in connectionsRef.current) {
                    const pc = connectionsRef.current[id];
                    const senders = pc.getSenders();
                    const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                    if (videoSender) {
                        videoSender.replaceTrack(screenTrack);
                    }
                }

                if (socketRef.current) {
                    socketRef.current.emit('user-action', 'screen', true);
                }

                screenTrack.onended = () => {
                    stopScreenShare();
                };

                setScreen(true);
                addNotification("You started screen sharing", "info");
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

        if (socketRef.current) {
            socketRef.current.emit('user-action', 'screen', false);
        }

        setScreen(false);
        addNotification("You stopped screen sharing", "info");
    };

    const handleRaiseHand = () => {
        const nextHandState = !handRaised;
        setHandRaised(nextHandState);
        if (socketRef.current) {
            socketRef.current.emit('user-action', 'raise-hand', nextHandState);
        }
        addNotification(nextHandState ? "You raised your hand" : "You lowered your hand", "warning");
    };

    const handleRecord = () => {
        const nextRecordState = !recording;
        setRecording(nextRecordState);
        if (socketRef.current) {
            socketRef.current.emit('user-action', 'recording', nextRecordState);
        }
        addNotification(nextRecordState ? "Recording started" : "Recording stopped", "error");
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
            addNotification(`New message from ${sender}`, "info");
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
        setShowParticipants(false);
        if (!showModal) {
            setNewMessages(0);
        }
    };

    const toggleParticipants = () => {
        setShowParticipants(!showParticipants);
        setModal(false);
    };

    return (
        <Box className={styles.meetVideoContainer}>
            {/* Toast Notifications Container */}
            <Box className={styles.notificationContainer}>
                {notifications.map(n => (
                    <Paper key={n.id} className={`${styles.notificationToast} ${styles[n.type]}`} elevation={6}>
                        <Typography variant="body2">{n.message}</Typography>
                    </Paper>
                ))}
            </Box>

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
                        {/* Top Info Bar */}
                        <Box className={styles.topInfoBar}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <TimerIcon sx={{ color: '#ff9839', fontSize: '1.2rem' }} />
                                <Typography variant="body2" sx={{ fontWeight: 600, color: '#ff9839' }}>
                                    {formatTime(elapsedTime)}
                                </Typography>
                            </Box>
                            
                            {recording && (
                                <Box className={styles.recordingIndicator}>
                                    <FiberManualRecordIcon className={styles.recIconPulse} />
                                    <Typography variant="caption" sx={{ fontWeight: 700 }}>REC</Typography>
                                </Box>
                            )}

                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <PeopleIcon sx={{ color: '#9ca3af', fontSize: '1.2rem' }} />
                                <Typography variant="body2" sx={{ fontWeight: 500, color: '#9ca3af' }}>
                                    Participants: {videos.length + 1}
                                </Typography>
                            </Box>
                        </Box>

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
                                
                                {/* Status Icons */}
                                <Box className={styles.cardStatusIcons}>
                                    {handRaised && <PanToolIcon className={styles.raisedHandIcon} />}
                                    {!audio && <MicOffIcon sx={{ color: '#f44336', fontSize: '1.2rem' }} />}
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
                            {videos.map((vid) => {
                                const status = participantsStatus[vid.socketId] || {};
                                const isMuted = status['audio'] === false;
                                const isCamOff = status['video'] === false;
                                const hasHand = status['raise-hand'] === true;
                                const isSharing = status['screen'] === true;
                                const pName = `Participant (${vid.socketId.substring(0, 4)})`;

                                return (
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
                                            <Typography variant="body2">{pName}</Typography>
                                        </Box>
                                        
                                        {/* Status Icons */}
                                        <Box className={styles.cardStatusIcons}>
                                            {hasHand && <PanToolIcon className={styles.raisedHandIcon} />}
                                            {isMuted && <MicOffIcon sx={{ color: '#f44336', fontSize: '1.2rem' }} />}
                                        </Box>

                                        {isCamOff && (
                                            <Box className={styles.videoMutedOverlay}>
                                                <Typography variant="h6">{pName.substring(13,15).toUpperCase()}</Typography>
                                            </Box>
                                        )}

                                        {isSharing && (
                                            <Box className={styles.screenShareOverlay}>
                                                <ScreenShareIcon sx={{ fontSize: '3rem', color: '#ff9839', mb: 1 }} />
                                                <Typography variant="body2" sx={{ fontWeight: 600 }}>Presenting Screen</Typography>
                                            </Box>
                                        )}
                                    </Box>
                                );
                            })}
                        </Box>
                    </Box>

                    {/* Floating Controls Dock */}
                    <Box className={styles.controlsDock}>
                        <IconButton 
                            onClick={handleVideo} 
                            className={`${styles.controlBtn} ${!video ? styles.btnMuted : ''}`}
                            title={video ? "Turn Camera Off" : "Turn Camera On"}
                        >
                            {video ? <VideocamIcon /> : <VideocamOffIcon />}
                        </IconButton>
                        
                        <IconButton 
                            onClick={handleAudio} 
                            className={`${styles.controlBtn} ${!audio ? styles.btnMuted : ''}`}
                            title={audio ? "Mute Microphone" : "Unmute Microphone"}
                        >
                            {audio ? <MicIcon /> : <MicOffIcon />}
                        </IconButton>

                        {screenAvailable && (
                            <IconButton 
                                onClick={handleScreen} 
                                className={`${styles.controlBtn} ${screen ? styles.btnActive : ''}`}
                                title={screen ? "Stop Sharing Screen" : "Share Screen"}
                            >
                                {screen ? <StopScreenShareIcon /> : <ScreenShareIcon />}
                            </IconButton>
                        )}

                        <IconButton 
                            onClick={handleRaiseHand} 
                            className={`${styles.controlBtn} ${handRaised ? styles.btnActive : ''}`}
                            title={handRaised ? "Lower Hand" : "Raise Hand"}
                        >
                            <PanToolIcon />
                        </IconButton>

                        <IconButton 
                            onClick={handleRecord} 
                            className={`${styles.controlBtn} ${recording ? styles.btnRecording : ''}`}
                            title={recording ? "Stop Recording" : "Record Meeting"}
                        >
                            <FiberManualRecordIcon />
                        </IconButton>

                        <IconButton 
                            onClick={toggleParticipants} 
                            className={`${styles.controlBtn} ${showParticipants ? styles.btnActive : ''}`}
                            title="Participants List"
                        >
                            <PeopleIcon />
                        </IconButton>

                        <Badge badgeContent={newMessages} color="error" max={99}>
                            <IconButton 
                                onClick={toggleChat} 
                                className={`${styles.controlBtn} ${showModal ? styles.btnActive : ''}`}
                                title="Chat Room"
                            >
                                <ChatIcon />
                            </IconButton>
                        </Badge>

                        <IconButton 
                            onClick={handleEndCall} 
                            className={`${styles.controlBtn} ${styles.btnHangup}`}
                            title="End Call"
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

                    {/* Sliding Participants Drawer */}
                    {showParticipants && (
                        <Box className={styles.chatDrawer}>
                            <Box className={styles.chatHeader}>
                                <Typography variant="h6">Participants ({videos.length + 1})</Typography>
                                <IconButton onClick={toggleParticipants} sx={{ color: 'white' }}>
                                    <span style={{ fontSize: '1.2rem' }}>&times;</span>
                                </IconButton>
                            </Box>

                            <Box className={styles.participantList}>
                                {/* Local User */}
                                <Box className={styles.participantItem}>
                                    <MuiAvatar sx={{ bgcolor: '#ff9839', width: 32, height: 32, fontSize: '0.9rem', mr: 1.5 }}>
                                        {username.substring(0,2).toUpperCase()}
                                    </MuiAvatar>
                                    <Box sx={{ flexGrow: 1 }}>
                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{username} (You)</Typography>
                                        <Typography variant="caption" sx={{ color: '#ff9839' }}>Host</Typography>
                                    </Box>
                                    <Box className={styles.participantIcons}>
                                        {handRaised && <PanToolIcon sx={{ color: '#ff9839', fontSize: '1.1rem', mr: 1 }} />}
                                        {screen && <ScreenShareIcon sx={{ color: '#ff9839', fontSize: '1.1rem', mr: 1 }} />}
                                        {audio ? <MicIcon sx={{ color: '#4caf50', fontSize: '1.1rem' }} /> : <MicOffIcon sx={{ color: '#f44336', fontSize: '1.1rem' }} />}
                                    </Box>
                                </Box>

                                {/* Remote Users */}
                                {videos.map(vid => {
                                    const status = participantsStatus[vid.socketId] || {};
                                    const hasHand = status['raise-hand'] === true;
                                    const isMuted = status['audio'] === false;
                                    const isSharing = status['screen'] === true;
                                    const pName = `Participant (${vid.socketId.substring(0, 4)})`;

                                    return (
                                        <Box className={styles.participantItem} key={vid.socketId}>
                                            <MuiAvatar sx={{ bgcolor: 'rgba(255,255,255,0.1)', width: 32, height: 32, fontSize: '0.9rem', mr: 1.5 }}>
                                                {pName.substring(13,15).toUpperCase()}
                                            </MuiAvatar>
                                            <Box sx={{ flexGrow: 1 }}>
                                                <Typography variant="body2" sx={{ fontWeight: 500 }}>{pName}</Typography>
                                                <Typography variant="caption" sx={{ color: '#9ca3af' }}>Participant</Typography>
                                            </Box>
                                            <Box className={styles.participantIcons}>
                                                {hasHand && <PanToolIcon sx={{ color: '#ff9839', fontSize: '1.1rem', mr: 1 }} />}
                                                {isSharing && <ScreenShareIcon sx={{ color: '#ff9839', fontSize: '1.1rem', mr: 1 }} />}
                                                {!isMuted ? <MicIcon sx={{ color: '#4caf50', fontSize: '1.1rem' }} /> : <MicOffIcon sx={{ color: '#f44336', fontSize: '1.1rem' }} />}
                                            </Box>
                                        </Box>
                                    );
                                })}
                            </Box>
                        </Box>
                    )}
                </Box>
            )}
        </Box>
    );
}