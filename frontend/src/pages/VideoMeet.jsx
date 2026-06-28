import React, { useEffect, useRef, useState } from 'react'
import io from "socket.io-client";
import { Badge, IconButton, TextField, Button, Paper, Typography, Box, CircularProgress, Avatar as MuiAvatar, Menu, MenuItem } from '@mui/material';
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
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LinkIcon from '@mui/icons-material/Link';
import PushPinIcon from '@mui/icons-material/PushPin';
import GridViewIcon from '@mui/icons-material/GridView';
import AccountBoxIcon from '@mui/icons-material/AccountBox';
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
    const videoElementsRef = useRef({});
    const screenStreamRef = useRef(null);
    
    // Audio volume analysis refs
    const volumesRef = useRef({});
    const localVolumeCleanupRef = useRef(null);

    // MediaPipe Face Tracking refs
    const trackersRef = useRef({});
    const [faceMlReady, setFaceMlReady] = useState(false);

    const [videoAvailable, setVideoAvailable] = useState(true);
    const [audioAvailable, setAudioAvailable] = useState(true);
    const [video, setVideo] = useState(true);
    const [audio, setAudio] = useState(true);
    const [screen, setScreen] = useState(false);
    const [screenAvailable, setScreenAvailable] = useState(false);
    
    // Collaboration & Layout Features
    const [handRaised, setHandRaised] = useState(false);
    const [recording, setRecording] = useState(false);
    const [showParticipants, setShowParticipants] = useState(false);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [notifications, setNotifications] = useState([]);
    const [participantsStatus, setParticipantsStatus] = useState({});
    const [activeSpeaker, setActiveSpeaker] = useState(null);

    // Layout Modes: 'gallery' or 'speaker'
    const [layoutMode, setLayoutMode] = useState('gallery');
    const [pinnedParticipant, setPinnedParticipant] = useState(null);
    const [layoutAnchorEl, setLayoutAnchorEl] = useState(null);

    const [showModal, setModal] = useState(false);
    const [messages, setMessages] = useState([]);
    const [message, setMessage] = useState("");
    const [newMessages, setNewMessages] = useState(0);
    
    const [askForUsername, setAskForUsername] = useState(true);
    const [username, setUsername] = useState("");
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(false);

    // Dynamic Script Loader for MediaPipe Face Detection
    const loadScript = (src) => {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.crossOrigin = "anonymous";
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    };

    // Helper to extract the clean meeting code from the URL path
    const getMeetingCode = () => {
        const path = window.location.pathname;
        const segments = path.split('/').filter(Boolean);
        const code = segments[segments.length - 1] || "default-room";
        console.log(`[App] Extracted Meeting Code: "${code}"`);
        return code;
    };

    // Load MediaPipe on mount and get local permissions
    useEffect(() => {
        getPermissions();
        
        loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/face_detection.js")
            .then(() => {
                console.log("MediaPipe Face Detection script loaded successfully");
                setFaceMlReady(true);
            })
            .catch(e => console.error("Failed to load MediaPipe Face Detection:", e));

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

    // Stream and Face Tracker Binding Effect
    useEffect(() => {
        // 1. Bind Local Video Stream & Auto-Framing
        const localEl = videoElementsRef.current['local'];
        if (localEl && window.localStream) {
            if (localEl.srcObject !== window.localStream) {
                localEl.srcObject = window.localStream;
                console.log("[UI] Local camera stream attached to video element");
            }
            
            const shouldTrack = faceMlReady && video && !screen;
            if (shouldTrack) {
                if (!trackersRef.current['local']) {
                    const cleanup = startTracking(localEl);
                    if (cleanup) trackersRef.current['local'] = cleanup;
                }
            } else {
                if (trackersRef.current['local']) {
                    trackersRef.current['local']();
                    delete trackersRef.current['local'];
                }
            }
        }

        // 2. Bind Remote Video Streams & Auto-Framing
        videos.forEach(vid => {
            const el = videoElementsRef.current[vid.socketId];
            if (el && vid.stream) {
                if (el.srcObject !== vid.stream) {
                    el.srcObject = vid.stream;
                    console.log(`[UI] Remote stream attached to video element for peer: ${vid.socketId}`);
                }

                const status = participantsStatus[vid.socketId] || {};
                const isCamActive = status.video !== false;
                const isSharing = status.screen === true;
                
                const shouldTrack = faceMlReady && isCamActive && !isSharing;
                if (shouldTrack) {
                    if (!trackersRef.current[vid.socketId]) {
                        const cleanup = startTracking(el);
                        if (cleanup) trackersRef.current[vid.socketId] = cleanup;
                    }
                } else {
                    if (trackersRef.current[vid.socketId]) {
                        trackersRef.current[vid.socketId]();
                        delete trackersRef.current[vid.socketId];
                    }
                }
            }
        });

        // 3. Cleanup face trackers for disconnected participants
        const activeIds = ['local', ...videos.map(v => v.socketId)];
        Object.keys(trackersRef.current).forEach(id => {
            if (!activeIds.includes(id)) {
                console.log(`[UI] Video element removed/cleaned up for peer: ${id}`);
                if (trackersRef.current[id]) trackersRef.current[id]();
                delete trackersRef.current[id];
            }
        });

    }, [videos, faceMlReady, video, screen, participantsStatus]);

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
        
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 4000);
    };

    // AI Auto-Framing (Face Centering) using MediaPipe
    const startTracking = (videoElement) => {
        if (!window.FaceDetection) return null;
        
        try {
            const faceDetection = new window.FaceDetection({
                locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`
            });
            
            faceDetection.setOptions({
                model: 'short',
                minDetectionConfidence: 0.45
            });
            
            faceDetection.onResults((results) => {
                if (results.detections && results.detections.length > 0) {
                    let minX = 1, minY = 1, maxX = 0, maxY = 0;
                    results.detections.forEach(det => {
                        const box = det.boundingBox;
                        minX = Math.min(minX, box.xCenter - box.width / 2);
                        minY = Math.min(minY, box.yCenter - box.height / 2);
                        maxX = Math.max(maxX, box.xCenter + box.width / 2);
                        maxY = Math.max(maxY, box.yCenter + box.height / 2);
                    });
                    
                    const centerX = (minX + maxX) / 2;
                    const centerY = (minY + maxY) / 2;
                    
                    const posX = Math.max(0.1, Math.min(0.9, centerX)) * 100;
                    const posY = Math.max(0.1, Math.min(0.9, centerY)) * 100;
                    
                    videoElement.style.objectPosition = `${posX}% ${posY}%`;
                } else {
                    videoElement.style.objectPosition = '50% 50%';
                }
            });
            
            let active = true;
            const processFrame = async () => {
                if (!active) return;
                if (videoElement.readyState >= 2) {
                    try {
                        await faceDetection.send({ image: videoElement });
                    } catch (e) {}
                }
                setTimeout(() => {
                    if (active) requestAnimationFrame(processFrame);
                }, 200);
            };
            
            requestAnimationFrame(processFrame);
            
            return () => {
                active = false;
                faceDetection.close().catch(() => {});
            };
        } catch (e) {
            console.warn("Failed to initialize MediaPipe FaceDetection:", e);
            return null;
        }
    };

    // Real-Time Audio Level Analyzer for Active Speaker Detection
    const monitorAudioVolume = (stream, onVolumeChange) => {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return null;

            const audioContext = new AudioContextClass();
            if (stream.getAudioTracks().length === 0) return null;

            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            
            const interval = setInterval(() => {
                if (audioContext.state === 'suspended') {
                    audioContext.resume();
                }
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sum += dataArray[i];
                }
                const average = sum / dataArray.length;
                onVolumeChange(average);
            }, 250);

            return () => {
                clearInterval(interval);
                audioContext.close().catch(() => {});
            };
        } catch (e) {
            console.warn("Audio volume analysis error:", e);
            return null;
        }
    };

    const determineActiveSpeaker = () => {
        let maxVolume = 12;
        let speaker = null;
        for (const [id, vol] of Object.entries(volumesRef.current)) {
            if (vol > maxVolume) {
                maxVolume = vol;
                speaker = id;
            }
        }
        setActiveSpeaker(speaker);
    };

    const cleanupCall = () => {
        console.log("[WebRTC] Cleaning up call resources...");
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
        if (localVolumeCleanupRef.current) {
            localVolumeCleanupRef.current();
            localVolumeCleanupRef.current = null;
        }
        
        for (let id in trackersRef.current) {
            if (trackersRef.current[id]) trackersRef.current[id]();
        }
        trackersRef.current = {};

        for (let id in connectionsRef.current) {
            const pc = connectionsRef.current[id];
            if (pc) {
                console.log(`[WebRTC] Peer closed for: ${id}`);
                if (pc.volumeCleanup) pc.volumeCleanup();
                pc.close();
            }
        }
        connectionsRef.current = {};
        volumesRef.current = {};
        videoElementsRef.current = {};
    };

    const createFallbackStream = () => {
        console.log("Creating fallback black/silent stream");
        const blackTrack = createBlackVideoTrack();
        const silenceTrack = createSilenceAudioTrack();
        const fallbackStream = new MediaStream([blackTrack, silenceTrack]);
        window.localStream = fallbackStream;
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
            setVideoAvailable(true);
            setAudioAvailable(true);
            setVideo(true);
            setAudio(true);

            setupLocalSpeakerMonitoring();
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
                    if (hasAudio) {
                        setupLocalSpeakerMonitoring();
                    }
                } else {
                    createFallbackStream();
                }
            } catch (fallbackErr) {
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

    const setupLocalSpeakerMonitoring = () => {
        if (localVolumeCleanupRef.current) localVolumeCleanupRef.current();
        if (window.localStream && window.localStream.getAudioTracks().length > 0) {
            const cleanup = monitorAudioVolume(window.localStream, (vol) => {
                volumesRef.current['local'] = audio ? vol : 0;
                determineActiveSpeaker();
            });
            if (cleanup) {
                localVolumeCleanupRef.current = cleanup;
            }
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
        console.log(`[WebRTC] Peer created for: ${socketListId}`);
        const pc = new RTCPeerConnection(peerConfigConnections);
        
        connectionsRef.current[socketListId] = pc;
        pc.iceQueue = [];

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log(`[WebRTC] ICE candidate sent to peer: ${socketListId}`);
                socketRef.current.emit('signal', socketListId, JSON.stringify({ 'ice': event.candidate }));
            }
        };

        pc.ontrack = (event) => {
            console.log(`[WebRTC] Remote track received from peer: ${socketListId} (Kind: ${event.track.kind})`);
            
            setVideos((prevVideos) => {
                const videoExists = prevVideos.find(v => v.socketId === socketListId);
                
                if (videoExists) {
                    const existingStream = videoExists.stream || new MediaStream();
                    if (!existingStream.getTracks().find(t => t.id === event.track.id)) {
                        existingStream.addTrack(event.track);
                        console.log(`[WebRTC] Remote track attached to existing stream for peer: ${socketListId}`);
                    }
                    return prevVideos.map(v => 
                        v.socketId === socketListId ? { ...v, stream: existingStream } : v
                    );
                } else {
                    const newStream = new MediaStream();
                    newStream.addTrack(event.track);
                    console.log(`[WebRTC] Remote track attached to new stream for peer: ${socketListId}`);
                    return [...prevVideos, {
                        socketId: socketListId,
                        stream: newStream,
                        autoplay: true,
                        playsinline: true
                    }];
                }
            });

            if (event.track.kind === 'audio') {
                const audioStream = new MediaStream([event.track]);
                if (pc.volumeCleanup) pc.volumeCleanup();
                const cleanup = monitorAudioVolume(audioStream, (vol) => {
                    const isMuted = participantsStatus[socketListId]?.audio === false;
                    volumesRef.current[socketListId] = isMuted ? 0 : vol;
                    determineActiveSpeaker();
                });
                if (cleanup) {
                    pc.volumeCleanup = cleanup;
                }
            }
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
            if (signal.sdp.type === 'offer') {
                console.log(`[WebRTC] Offer received from peer: ${fromId}`);
                pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
                    .then(() => {
                        // Flush any queued ICE candidates
                        if (pc.iceQueue && pc.iceQueue.length > 0) {
                            pc.iceQueue.forEach(candidate => {
                                pc.addIceCandidate(new RTCIceCandidate(candidate))
                                    .catch(e => console.error("Error adding queued ICE candidate:", e));
                            });
                            pc.iceQueue = [];
                        }

                        pc.createAnswer().then((description) => {
                            console.log(`[WebRTC] Answer created for peer: ${fromId}`);
                            pc.setLocalDescription(description).then(() => {
                                socketRef.current.emit('signal', fromId, JSON.stringify({ 'sdp': pc.localDescription }));
                            }).catch(e => console.error("Error setting local description:", e));
                        }).catch(e => console.error("Error creating answer:", e));
                    })
                    .catch(e => console.error("Error setting remote description:", e));
            } else if (signal.sdp.type === 'answer') {
                console.log(`[WebRTC] Answer received from peer: ${fromId}`);
                pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
                    .then(() => {
                        if (pc.iceQueue && pc.iceQueue.length > 0) {
                            pc.iceQueue.forEach(candidate => {
                                pc.addIceCandidate(new RTCIceCandidate(candidate))
                                    .catch(e => console.error("Error adding queued ICE candidate:", e));
                            });
                            pc.iceQueue = [];
                        }
                    })
                    .catch(e => console.error("Error setting remote description:", e));
            }
        }

        if (signal.ice) {
            console.log(`[WebRTC] ICE candidate received from peer: ${fromId}`);
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

            // CRITICAL FIX: Emit ONLY the clean meeting code, NOT the full window.location.href.
            // This prevents devices using different hostnames (e.g. localhost vs 192.168.x.x) from being placed in separate rooms.
            const meetingCode = getMeetingCode();
            socketRef.current.emit('join-call', meetingCode);

            socketRef.current.emit('user-action', 'username', username);
            socketRef.current.emit('user-action', 'video', video);
            socketRef.current.emit('user-action', 'audio', audio);

            socketRef.current.on('chat-message', addMessage);

            socketRef.current.on('user-action', (fromId, actionType, value) => {
                setParticipantsStatus(prev => ({
                    ...prev,
                    [fromId]: {
                        ...prev[fromId],
                        [actionType]: value
                    }
                }));

                const displayName = actionType === 'username' ? value : (participantsStatus[fromId]?.username || `Participant (${fromId.substring(0, 4)})`);

                if (actionType === 'audio') {
                    addNotification(`${displayName} ${value ? 'unmuted' : 'muted'} their mic`, 'info');
                    if (!value) {
                        volumesRef.current[fromId] = 0;
                        determineActiveSpeaker();
                    }
                } else if (actionType === 'video') {
                    addNotification(`${displayName} turned their camera ${value ? 'on' : 'off'}`, 'info');
                } else if (actionType === 'screen') {
                    addNotification(`${displayName} ${value ? 'started' : 'stopped'} screen sharing`, 'info');
                } else if (actionType === 'raise-hand') {
                    addNotification(`${displayName} ${value ? 'raised' : 'lowered'} their hand`, 'warning');
                } else if (actionType === 'recording') {
                    addNotification(`${displayName} ${value ? 'started' : 'stopped'} recording the meeting`, 'error');
                    setRecording(value);
                } else if (actionType === 'username') {
                    addNotification(`${value} joined the meeting`, 'success');
                }
            });

            socketRef.current.on('user-left', (id) => {
                const displayName = participantsStatus[id]?.username || `Participant (${id.substring(0, 4)})`;
                addNotification(`${displayName} left the meeting`, 'warning');
                console.log(`[Socket] User left: ${id}`);
                
                setVideos((prevVideos) => prevVideos.filter((v) => v.socketId !== id));
                
                delete volumesRef.current[id];
                determineActiveSpeaker();

                if (pinnedParticipant === id) {
                    setPinnedParticipant(null);
                }

                setParticipantsStatus(prev => {
                    const next = { ...prev };
                    delete next[id];
                    return next;
                });
                
                if (trackersRef.current[id]) {
                    trackersRef.current[id]();
                    delete trackersRef.current[id];
                }

                const pc = connectionsRef.current[id];
                if (pc) {
                    console.log(`[WebRTC] Peer closed for: ${id}`);
                    if (pc.volumeCleanup) pc.volumeCleanup();
                    pc.close();
                    delete connectionsRef.current[id];
                }
            });

            socketRef.current.on('user-joined', (joinedUserId, allClients) => {
                console.log(`[Socket] User joined event received. Joining User: ${joinedUserId}`);
                
                if (joinedUserId === socketIdRef.current) {
                    addNotification("You joined the meeting", "success");
                    allClients.forEach((socketListId) => {
                        if (socketListId === socketIdRef.current) return;
                        if (connectionsRef.current[socketListId]) return;

                        const pc = initializePeerConnection(socketListId);

                        console.log(`[WebRTC] Creating offer for peer: ${socketListId}`);
                        pc.createOffer().then((description) => {
                            pc.setLocalDescription(description).then(() => {
                                socketRef.current.emit('signal', socketListId, JSON.stringify({ 'sdp': pc.localDescription }));
                            }).catch(e => console.error("Error setting local description:", e));
                        }).catch(e => console.error("Error creating offer:", e));
                    });
                } else {
                    socketRef.current.emit('user-action', 'username', username);
                    socketRef.current.emit('user-action', 'video', video);
                    socketRef.current.emit('user-action', 'audio', audio);
                    if (handRaised) socketRef.current.emit('user-action', 'raise-hand', handRaised);
                    
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
        volumesRef.current['local'] = nextAudioState ? (volumesRef.current['local'] || 0) : 0;
        determineActiveSpeaker();
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

    const copyMeetingCode = () => {
        const code = getMeetingCode();
        navigator.clipboard.writeText(code)
            .then(() => addNotification("Meeting code copied to clipboard!", "success"))
            .catch(() => addNotification("Failed to copy meeting code", "error"));
    };

    const copyInviteLink = () => {
        const link = window.location.href;
        navigator.clipboard.writeText(link)
            .then(() => addNotification("Invite link copied to clipboard!", "success"))
            .catch(() => addNotification("Failed to copy invite link", "error"));
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

    // Pin / Unpin a participant
    const togglePinParticipant = (id) => {
        if (pinnedParticipant === id) {
            setPinnedParticipant(null);
        } else {
            setPinnedParticipant(id);
            setLayoutMode('speaker');
        }
    };

    // Calculate grid classes based on total participant count in Gallery View
    const getGalleryGridClass = (totalCount) => {
        if (totalCount === 1) return styles.grid1;
        if (totalCount <= 4) return styles.grid2to4;
        if (totalCount <= 9) return styles.grid5to9;
        return styles.grid10plus;
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
                                    ref={el => {
                                        if (el) videoElementsRef.current['local'] = el;
                                        else delete videoElementsRef.current['local'];
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

                            {/* Meeting Code & Invite Links */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(255,255,255,0.03)', px: 2, py: 0.5, borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: '#e5e7eb' }}>
                                    Code: {getMeetingCode()}
                                </Typography>
                                <IconButton onClick={copyMeetingCode} size="small" sx={{ color: '#9ca3af' }} title="Copy Meeting Code">
                                    <ContentCopyIcon sx={{ fontSize: '1rem' }} />
                                </IconButton>
                                <IconButton onClick={copyInviteLink} size="small" sx={{ color: '#9ca3af' }} title="Copy Invite Link">
                                    <LinkIcon sx={{ fontSize: '1.1rem' }} />
                                </IconButton>
                            </Box>

                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <PeopleIcon sx={{ color: '#9ca3af', fontSize: '1.2rem' }} />
                                <Typography variant="body2" sx={{ fontWeight: 500, color: '#9ca3af' }}>
                                    Participants: {videos.length + 1}
                                </Typography>
                            </Box>
                        </Box>

                        {/* --- DYNAMIC GRID LAYOUTS --- */}
                        {layoutMode === 'speaker' || pinnedParticipant ? (
                            // SPEAKER VIEW / STAGE LAYOUT (Main Stage + Filmstrip)
                            <Box className={styles.speakerLayout}>
                                {/* Main Stage */}
                                <Box className={styles.mainStage}>
                                    {pinnedParticipant === 'local' || (!pinnedParticipant && activeSpeaker === 'local') || (!pinnedParticipant && !activeSpeaker) ? (
                                        // Local on Stage
                                        <Box className={`${styles.videoCard} ${styles.stageCard} ${activeSpeaker === 'local' ? styles.activeSpeaker : ''}`}>
                                            <video 
                                                ref={el => {
                                                    if (el) videoElementsRef.current['local'] = el;
                                                    else delete videoElementsRef.current['local'];
                                                }} 
                                                className={styles.videoElement} 
                                                autoPlay 
                                                muted
                                            ></video>
                                            <Box className={styles.videoLabel}>
                                                <PersonIcon fontSize="small" sx={{ mr: 0.5 }} />
                                                <Typography variant="body2">{username} (You)</Typography>
                                            </Box>
                                            <Box className={styles.cardStatusIcons}>
                                                <IconButton onClick={() => togglePinParticipant('local')} size="small" className={styles.pinBtnActive}>
                                                    <PushPinIcon sx={{ fontSize: '1.1rem' }} />
                                                </IconButton>
                                                {handRaised && <PanToolIcon className={styles.raisedHandIcon} />}
                                                {!audio && <MicOffIcon sx={{ color: '#f44336', fontSize: '1.2rem' }} />}
                                            </Box>
                                            {!video && (
                                                <Box className={styles.videoMutedOverlay}>
                                                    <MuiAvatar sx={{ width: 80, height: 80, fontSize: '2.5rem', bgcolor: '#ff9839' }}>
                                                        {username.substring(0,2).toUpperCase()}
                                                    </MuiAvatar>
                                                </Box>
                                            )}
                                            {screen && (
                                                <Box className={styles.screenShareOverlay}>
                                                    <ScreenShareIcon sx={{ fontSize: '4rem', color: '#ff9839', mb: 1 }} />
                                                    <Typography variant="h6">You are presenting</Typography>
                                                </Box>
                                            )}
                                        </Box>
                                    ) : (
                                        // Remote Participant on Stage
                                        (() => {
                                            const stageId = pinnedParticipant || activeSpeaker || (videos[0]?.socketId);
                                            const vid = videos.find(v => v.socketId === stageId);
                                            if (!vid) return null;
                                            const status = participantsStatus[stageId] || {};
                                            const isMuted = status['audio'] === false;
                                            const isCamOff = status['video'] === false;
                                            const hasHand = status['raise-hand'] === true;
                                            const isSharing = status['screen'] === true;
                                            const displayName = status['username'] || `Participant (${stageId.substring(0, 4)})`;

                                            return (
                                                <Box className={`${styles.videoCard} ${styles.stageCard} ${activeSpeaker === stageId ? styles.activeSpeaker : ''}`} key={stageId}>
                                                    <video 
                                                        ref={el => {
                                                            if (el) videoElementsRef.current[stageId] = el;
                                                            else delete videoElementsRef.current[stageId];
                                                        }} 
                                                        className={styles.videoElement} 
                                                        autoPlay 
                                                        playsInline
                                                    ></video>
                                                    <Box className={styles.videoLabel}>
                                                        <PersonIcon fontSize="small" sx={{ mr: 0.5 }} />
                                                        <Typography variant="body2">{displayName}</Typography>
                                                    </Box>
                                                    <Box className={styles.cardStatusIcons}>
                                                        <IconButton onClick={() => togglePinParticipant(stageId)} size="small" className={pinnedParticipant === stageId ? styles.pinBtnActive : styles.pinBtnHover}>
                                                            <PushPinIcon sx={{ fontSize: '1.1rem' }} />
                                                        </IconButton>
                                                        {hasHand && <PanToolIcon className={styles.raisedHandIcon} />}
                                                        {isMuted && <MicOffIcon sx={{ color: '#f44336', fontSize: '1.2rem' }} />}
                                                    </Box>
                                                    {isCamOff && (
                                                        <Box className={styles.videoMutedOverlay}>
                                                            <MuiAvatar sx={{ width: 80, height: 80, fontSize: '2.5rem', bgcolor: 'rgba(255,255,255,0.1)' }}>
                                                                {displayName.substring(0,2).toUpperCase()}
                                                            </MuiAvatar>
                                                        </Box>
                                                    )}
                                                    {isSharing && (
                                                        <Box className={styles.screenShareOverlay}>
                                                            <ScreenShareIcon sx={{ fontSize: '4rem', color: '#ff9839', mb: 1 }} />
                                                            <Typography variant="h6">Presenting Screen</Typography>
                                                        </Box>
                                                    )}
                                                </Box>
                                            );
                                        })()
                                    )}
                                </Box>

                                {/* Sidebar Filmstrip */}
                                <Box className={styles.filmstrip}>
                                    {/* Local Thumbnail (if not on stage) */}
                                    {(pinnedParticipant && pinnedParticipant !== 'local' && (pinnedParticipant || activeSpeaker !== 'local')) && (
                                        <Box className={`${styles.videoCard} ${styles.filmstripCard} ${activeSpeaker === 'local' ? styles.activeSpeaker : ''}`}>
                                            <video 
                                                ref={el => {
                                                    if (el) videoElementsRef.current['local'] = el;
                                                    else delete videoElementsRef.current['local'];
                                                }} 
                                                className={styles.videoElement} 
                                                autoPlay 
                                                muted
                                            ></video>
                                            <Box className={styles.videoLabel}>
                                                <Typography variant="caption">{username} (You)</Typography>
                                            </Box>
                                            <Box className={styles.cardStatusIconsSmall}>
                                                <IconButton onClick={() => togglePinParticipant('local')} size="small" className={styles.pinBtnSmall}>
                                                    <PushPinIcon sx={{ fontSize: '0.8rem' }} />
                                                </IconButton>
                                            </Box>
                                            {!video && (
                                                <Box className={styles.videoMutedOverlay}>
                                                    <MuiAvatar sx={{ width: 40, height: 40, fontSize: '1.1rem', bgcolor: '#ff9839' }}>
                                                        {username.substring(0,2).toUpperCase()}
                                                    </MuiAvatar>
                                                </Box>
                                            )}
                                        </Box>
                                    )}

                                    {/* Remote Thumbnails */}
                                    {videos.map((vid) => {
                                        const stageId = pinnedParticipant || activeSpeaker || (videos[0]?.socketId);
                                        if (vid.socketId === stageId && pinnedParticipant) return null;

                                        const status = participantsStatus[vid.socketId] || {};
                                        const isMuted = status['audio'] === false;
                                        const isCamOff = status['video'] === false;
                                        const displayName = status['username'] || `Participant (${vid.socketId.substring(0, 4)})`;

                                        return (
                                            <Box className={`${styles.videoCard} ${styles.filmstripCard} ${activeSpeaker === vid.socketId ? styles.activeSpeaker : ''}`} key={vid.socketId}>
                                                <video 
                                                    ref={el => {
                                                        if (el) videoElementsRef.current[vid.socketId] = el;
                                                        else delete videoElementsRef.current[vid.socketId];
                                                    }} 
                                                    className={styles.videoElement} 
                                                    autoPlay 
                                                    playsInline
                                                ></video>
                                                <Box className={styles.videoLabel}>
                                                    <Typography variant="caption">{displayName}</Typography>
                                                </Box>
                                                <Box className={styles.cardStatusIconsSmall}>
                                                    <IconButton onClick={() => togglePinParticipant(vid.socketId)} size="small" className={styles.pinBtnSmall}>
                                                        <PushPinIcon sx={{ fontSize: '0.8rem' }} />
                                                    </IconButton>
                                                </Box>
                                                {isCamOff && (
                                                    <Box className={styles.videoMutedOverlay}>
                                                        <MuiAvatar sx={{ width: 40, height: 40, fontSize: '1.1rem', bgcolor: 'rgba(255,255,255,0.1)' }}>
                                                            {displayName.substring(0,2).toUpperCase()}
                                                        </MuiAvatar>
                                                    </Box>
                                                )}
                                            </Box>
                                        );
                                    })}
                                </Box>
                            </Box>
                        ) : (
                            // GALLERY VIEW (Responsive Grid)
                            <Box className={`${styles.videoGrid} ${getGalleryGridClass(videos.length + 1)}`}>
                                {/* Local Video Card */}
                                <Box className={`${styles.videoCard} ${activeSpeaker === 'local' ? styles.activeSpeaker : ''}`}>
                                    <video 
                                        ref={el => {
                                            if (el) videoElementsRef.current['local'] = el;
                                            else delete videoElementsRef.current['local'];
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
                                        <IconButton onClick={() => togglePinParticipant('local')} size="small" className={styles.pinBtnHover}>
                                            <PushPinIcon sx={{ fontSize: '1.1rem' }} />
                                        </IconButton>
                                        {handRaised && <PanToolIcon className={styles.raisedHandIcon} />}
                                        {!audio && <MicOffIcon sx={{ color: '#f44336', fontSize: '1.2rem' }} />}
                                    </Box>

                                    {!video && (
                                        <Box className={styles.videoMutedOverlay}>
                                            <MuiAvatar sx={{ width: 70, height: 70, fontSize: '2rem', bgcolor: '#ff9839' }}>
                                                {username.substring(0,2).toUpperCase()}
                                            </MuiAvatar>
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
                                    const isSpeaker = activeSpeaker === vid.socketId;
                                    const displayName = status['username'] || `Participant (${vid.socketId.substring(0, 4)})`;

                                    return (
                                        <Box className={`${styles.videoCard} ${isSpeaker ? styles.activeSpeaker : ''}`} key={vid.socketId}>
                                            <video 
                                                ref={el => {
                                                    if (el) videoElementsRef.current[vid.socketId] = el;
                                                    else delete videoElementsRef.current[vid.socketId];
                                                }} 
                                                className={styles.videoElement} 
                                                autoPlay 
                                                playsInline
                                            ></video>
                                            <Box className={styles.videoLabel}>
                                                <PersonIcon fontSize="small" sx={{ mr: 0.5 }} />
                                                <Typography variant="body2">{displayName}</Typography>
                                            </Box>
                                            
                                            {/* Status Icons */}
                                            <Box className={styles.cardStatusIcons}>
                                                <IconButton onClick={() => togglePinParticipant(vid.socketId)} size="small" className={styles.pinBtnHover}>
                                                    <PushPinIcon sx={{ fontSize: '1.1rem' }} />
                                                </IconButton>
                                                {hasHand && <PanToolIcon className={styles.raisedHandIcon} />}
                                                {isMuted && <MicOffIcon sx={{ color: '#f44336', fontSize: '1.2rem' }} />}
                                            </Box>

                                            {isCamOff && (
                                                <Box className={styles.videoMutedOverlay}>
                                                    <MuiAvatar sx={{ width: 70, height: 70, fontSize: '2rem', bgcolor: 'rgba(255,255,255,0.1)' }}>
                                                        {displayName.substring(0,2).toUpperCase()}
                                                    </MuiAvatar>
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
                        )}
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

                        {/* Layout Toggle Menu */}
                        <IconButton 
                            onClick={(e) => setLayoutAnchorEl(e.currentTarget)} 
                            className={styles.controlBtn}
                            title="Choose Layout"
                        >
                            {layoutMode === 'gallery' ? <GridViewIcon /> : <AccountBoxIcon />}
                        </IconButton>
                        <Menu
                            anchorEl={layoutAnchorEl}
                            open={Boolean(layoutAnchorEl)}
                            onClose={() => setLayoutAnchorEl(null)}
                            PaperProps={{
                                style: {
                                    background: '#111827',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: '8px'
                                }
                            }}
                        >
                            <MenuItem onClick={() => { setLayoutMode('gallery'); setPinnedParticipant(null); setLayoutAnchorEl(null); }} style={{ gap: '10px' }}>
                                <GridViewIcon fontSize="small" style={{ color: '#ff9839' }} /> Gallery View
                            </MenuItem>
                            <MenuItem onClick={() => { setLayoutMode('speaker'); setLayoutAnchorEl(null); }} style={{ gap: '10px' }}>
                                <AccountBoxIcon fontSize="small" style={{ color: '#ff9839' }} /> Speaker View
                            </MenuItem>
                        </Menu>

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
                                    const displayName = status['username'] || `Participant (${vid.socketId.substring(0, 4)})`;

                                    return (
                                        <Box className={styles.participantItem} key={vid.socketId}>
                                            <MuiAvatar sx={{ bgcolor: 'rgba(255,255,255,0.1)', width: 32, height: 32, fontSize: '0.9rem', mr: 1.5 }}>
                                                {displayName.substring(0,2).toUpperCase()}
                                            </MuiAvatar>
                                            <Box sx={{ flexGrow: 1 }}>
                                                <Typography variant="body2" sx={{ fontWeight: 500 }}>{displayName}</Typography>
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