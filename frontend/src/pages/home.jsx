import React, { useContext, useState, useEffect } from 'react';
import withAuth from '../utils/withAuth';
import { useNavigate } from 'react-router-dom';
import "../App.css";
import { Button, IconButton, TextField, Dialog, DialogTitle, DialogContent, DialogActions, Typography, Box, Avatar } from '@mui/material';
import VideoCallIcon from '@mui/icons-material/VideoCall';
import AddBoxIcon from '@mui/icons-material/AddBox';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import SettingsIcon from '@mui/icons-material/Settings';
import RestoreIcon from '@mui/icons-material/Restore';
import { AuthContext } from '../contexts/AuthContext';

function HomeComponent() {
    const navigate = useNavigate();
    const { addToUserHistory, getHistoryOfUser, handleLogout } = useContext(AuthContext);

    const [currentTime, setCurrentTime] = useState(new Date());
    const [joinDialogOpen, setJoinDialogOpen] = useState(false);
    const [meetingCode, setMeetingCode] = useState("");
    const [historyList, setHistoryList] = useState([]);
    const [activeTab, setActiveTab] = useState("home");

    // Live clock update
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Fetch user activity history
    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const data = await getHistoryOfUser();
                if (Array.isArray(data)) {
                    // Sort by most recent
                    setHistoryList(data.reverse().slice(0, 5));
                }
            } catch (err) {
                console.error("Failed to fetch meeting history:", err);
            }
        };
        fetchHistory();
    }, [getHistoryOfUser]);

    // Format current time (e.g. 10:42 AM)
    const formatTime = (date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    // Format current date (e.g. Sunday, June 28, 2026)
    const formatDate = (date) => {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    };

    // Generate a random 9-character meeting code (e.g. abc-def-ghi)
    const generateMeetingCode = () => {
        const chars = 'abcdefghijklmnopqrstuvwxyz';
        let code = '';
        for (let i = 0; i < 9; i++) {
            if (i === 3 || i === 6) code += '-';
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    };

    // Handler for creating a new meeting instantly
    const handleNewMeeting = async () => {
        const newCode = generateMeetingCode();
        await addToUserHistory(newCode);
        navigate(`/${newCode}`);
    };

    // Handler for joining an existing meeting
    const handleJoinMeeting = async () => {
        if (!meetingCode.trim()) {
            alert("Please enter a valid meeting code");
            return;
        }
        const cleanCode = meetingCode.trim().replace(/\s+/g, "");
        await addToUserHistory(cleanCode);
        navigate(`/${cleanCode}`);
    };

    return (
        <div className="zoomHomeContainer">
            {/* Top Navbar */}
            <div className="zoomNavbar">
                <div className="zoomNavbarLogo">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM16 13L13 15V13H8V11H13V9L16 11V13Z" fill="#0e72ed"/>
                    </svg>
                    <span>MeetSphere</span>
                </div>

                <div className="zoomNavbarTabs">
                    <div 
                        className={`zoomNavbarTab ${activeTab === 'home' ? 'active' : ''}`} 
                        onClick={() => setActiveTab('home')}
                    >
                        Home
                    </div>
                    <div 
                        className={`zoomNavbarTab ${activeTab === 'history' ? 'active' : ''}`} 
                        onClick={() => {
                            setActiveTab('history');
                            navigate("/history");
                        }}
                    >
                        History
                    </div>
                </div>

                <div className="zoomNavbarRight">
                    <IconButton sx={{ color: '#9ca3af' }} title="Settings">
                        <SettingsIcon />
                    </IconButton>
                    <Avatar sx={{ bgcolor: '#0e72ed', width: 32, height: 32, fontSize: '0.9rem' }}>
                        U
                    </Avatar>
                    <Button 
                        onClick={handleLogout} 
                        variant="outlined" 
                        color="error" 
                        size="small"
                        sx={{ textTransform: 'none', borderRadius: '8px' }}
                    >
                        Logout
                    </Button>
                </div>
            </div>

            {/* Main Workspace */}
            <div className="zoomMainContent">
                {/* Left Panel: Big Action Cards */}
                <div className="zoomLeftPanel">
                    <div className="zoomActionCard" onClick={handleNewMeeting}>
                        <div className="zoomCardIconContainer orange">
                            <VideoCallIcon sx={{ fontSize: '2.5rem' }} />
                        </div>
                        <p>New Meeting</p>
                        <span>Start an instant meeting</span>
                    </div>

                    <div className="zoomActionCard" onClick={() => setJoinDialogOpen(true)}>
                        <div className="zoomCardIconContainer blue">
                            <AddBoxIcon sx={{ fontSize: '2.5rem' }} />
                        </div>
                        <p>Join</p>
                        <span>Join with a meeting code</span>
                    </div>

                    <div className="zoomActionCard" onClick={() => alert("Scheduling feature coming soon!")}>
                        <div className="zoomCardIconContainer blue">
                            <CalendarMonthIcon sx={{ fontSize: '2.5rem' }} />
                        </div>
                        <p>Schedule</p>
                        <span>Plan an upcoming meeting</span>
                    </div>

                    <div className="zoomActionCard" onClick={() => setJoinDialogOpen(true)}>
                        <div className="zoomCardIconContainer blue">
                            <ScreenShareIcon sx={{ fontSize: '2.5rem' }} />
                        </div>
                        <p>Share Screen</p>
                        <span>Present in a meeting</span>
                    </div>
                </div>

                {/* Right Panel: Clock & Activity */}
                <div className="zoomRightPanel">
                    {/* Digital Clock Card */}
                    <div className="zoomClockCard">
                        <h1 className="zoomTimeText">{formatTime(currentTime)}</h1>
                        <p className="zoomDateText">{formatDate(currentTime)}</p>
                    </div>

                    {/* Recent History Card */}
                    <div className="zoomHistoryCard">
                        <div className="zoomHistoryHeader">
                            <RestoreIcon />
                            <span>Recent Meetings</span>
                        </div>
                        <div className="zoomHistoryList">
                            {historyList.length > 0 ? (
                                historyList.map((item, index) => (
                                    <div className="zoomHistoryItem" key={index}>
                                        <div className="zoomHistoryItemInfo">
                                            <h4>Code: {item.meetingCode}</h4>
                                            <p>Joined on: {new Date(item.date).toLocaleDateString()}</p>
                                        </div>
                                        <Button 
                                            className="zoomHistoryItemButton"
                                            onClick={() => navigate(`/${item.meetingCode}`)}
                                        >
                                            Rejoin
                                        </Button>
                                    </div>
                                ))
                            ) : (
                                <Box sx={{ display: 'flex', flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}>
                                    <Typography variant="body2" sx={{ color: '#6b7280' }}>
                                        No recent meeting logs found.
                                    </Typography>
                                </Box>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Join Meeting Dialog */}
            <Dialog 
                open={joinDialogOpen} 
                onClose={() => setJoinDialogOpen(false)}
                PaperProps={{ className: "zoomModalContent" }}
            >
                <DialogTitle className="zoomModalTitle">Join Meeting</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ color: '#9ca3af', mb: 2 }}>
                        Enter the meeting code below to connect to the video call.
                    </Typography>
                    <TextField
                        autoFocus
                        fullWidth
                        label="Meeting Code"
                        variant="outlined"
                        value={meetingCode}
                        onChange={(e) => setMeetingCode(e.target.value)}
                        className="zoomModalInput"
                        onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                                handleJoinMeeting();
                                setJoinDialogOpen(false);
                            }
                        }}
                        InputProps={{ style: { color: 'white' } }}
                        InputLabelProps={{ style: { color: '#9ca3af' } }}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2.5 }}>
                    <Button 
                        onClick={() => setJoinDialogOpen(false)} 
                        sx={{ color: '#9ca3af', textTransform: 'none' }}
                    >
                        Cancel
                    </Button>
                    <Button 
                        onClick={() => {
                            handleJoinMeeting();
                            setJoinDialogOpen(false);
                        }} 
                        variant="contained" 
                        sx={{ bgcolor: '#0e72ed', textTransform: 'none', borderRadius: '8px' }}
                    >
                        Join
                    </Button>
                </DialogActions>
            </Dialog>
        </div>
    );
}

export default withAuth(HomeComponent);