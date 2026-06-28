import React, { useState } from 'react'
import "../App.css"
import { Link, useNavigate } from 'react-router-dom'
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Box, ThemeProvider, createTheme } from '@mui/material'

// Dark Theme for the Dialog
const darkTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#ff9839',
        },
        background: {
            default: '#0b0f19',
            paper: '#111827',
        },
    },
    typography: {
        fontFamily: "'Outfit', 'Inter', sans-serif",
    }
});

export default function LandingPage() {
    const router = useNavigate();
    const [open, setOpen] = useState(false);
    const [meetingCode, setMeetingCode] = useState("");

    const handleJoinAsGuest = () => {
        if (meetingCode.trim()) {
            setOpen(false);
            router(`/${meetingCode.trim()}`);
        } else {
            alert("Please enter a valid meeting code");
        }
    };

    return (
        <ThemeProvider theme={darkTheme}>
            <div className='landingPageContainer'>
                <nav>
                    <div className='navHeader'>
                        <h2>Apna Video Call</h2>
                    </div>
                    <div className='navlist'>
                        <p onClick={() => setOpen(true)} style={{ fontWeight: 600 }}>
                            Join as Guest
                        </p>
                        <p onClick={() => router("/auth")}>Register</p>
                        <div onClick={() => router("/auth")} role='button'>
                            <p>Login</p>
                        </div>
                    </div>
                </nav>

                <div className="landingMainContainer">
                    <div>
                        <h1><span style={{ color: "#FF9839" }}>Connect</span> with your loved Ones</h1>
                        <p>Cover a distance by Apna Video Call</p>
                        <div role='button'>
                            <Link to={"/auth"}>Get Started</Link>
                        </div>
                    </div>
                    <div>
                        <img src="/mobile.png" alt="" />
                    </div>
                </div>

                {/* Guest Join Dialog */}
                <Dialog 
                    open={open} 
                    onClose={() => setOpen(false)}
                    PaperProps={{
                        style: {
                            background: 'rgba(17, 24, 39, 0.9)',
                            backdropFilter: 'blur(16px)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '16px',
                            padding: '10px'
                        }
                    }}
                >
                    <DialogTitle style={{ fontWeight: 700, color: '#ff9839' }}>
                        Join as Guest
                    </DialogTitle>
                    <DialogContent>
                        <Box sx={{ mt: 1, minWidth: '300px' }}>
                            <TextField
                                autoFocus
                                fullWidth
                                label="Meeting Code"
                                variant="outlined"
                                value={meetingCode}
                                onChange={(e) => setMeetingCode(e.target.value)}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') handleJoinAsGuest();
                                }}
                            />
                        </Box>
                    </DialogContent>
                    <DialogActions style={{ padding: '0 24px 20px 24px' }}>
                        <Button onClick={() => setOpen(false)} color="inherit">
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleJoinAsGuest} 
                            variant="contained" 
                            style={{
                                background: 'linear-gradient(135deg, #ff9839 0%, #e65100 100%)',
                                color: 'white',
                                borderRadius: '8px'
                            }}
                        >
                            Join Meeting
                        </Button>
                    </DialogActions>
                </Dialog>
            </div>
        </ThemeProvider>
    )
}