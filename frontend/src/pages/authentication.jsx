import * as React from 'react';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import CssBaseline from '@mui/material/CssBaseline';
import TextField from '@mui/material/TextField';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import Typography from '@mui/material/Typography';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { AuthContext } from '../contexts/AuthContext';
import { Snackbar } from '@mui/material';

// Modern Dark Theme for MUI
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
        text: {
            primary: '#f3f4f6',
            secondary: '#9ca3af',
        }
    },
    typography: {
        fontFamily: "'Outfit', 'Inter', sans-serif",
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: '12px',
                    textTransform: 'none',
                    fontWeight: 600,
                    padding: '10px 20px',
                }
            }
        },
        MuiTextField: {
            styleOverrides: {
                root: {
                    '& .MuiOutlinedInput-root': {
                        borderRadius: '12px',
                    }
                }
            }
        }
    }
});

export default function Authentication() {
    // Initialize with empty strings to prevent React uncontrolled input warnings
    const [username, setUsername] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [name, setName] = React.useState("");
    const [error, setError] = React.useState("");
    const [message, setMessage] = React.useState("");
    const [formState, setFormState] = React.useState(0); // 0: Login, 1: Register
    const [open, setOpen] = React.useState(false);

    const { handleRegister, handleLogin } = React.useContext(AuthContext);

    let handleAuth = async () => {
        if (!username || !password || (formState === 1 && !name)) {
            setError("All fields are required");
            return;
        }
        try {
            setError("");
            if (formState === 0) {
                await handleLogin(username, password);
            }
            if (formState === 1) {
                let result = await handleRegister(name, username, password);
                console.log(result);
                setUsername("");
                setMessage(result);
                setOpen(true);
                setFormState(0);
                setPassword("");
                setName("");
            }
        } catch (err) {
            console.error(err);
            const msg = err.response?.data?.message || "Something went wrong";
            setError(msg);
        }
    };

    return (
        <ThemeProvider theme={darkTheme}>
            <Grid container component="main" sx={{ height: '100vh', background: '#0b0f19' }}>
                <CssBaseline />
                {/* Left Side: Branding and Visuals */}
                <Grid
                    item
                    xs={false}
                    sm={4}
                    md={7}
                    sx={{
                        background: 'radial-gradient(circle at center, #1e1b4b 0%, #0b0f19 100%)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: 6,
                        textAlign: 'center',
                        borderRight: '1px solid rgba(255, 255, 255, 0.05)',
                        position: 'relative',
                        overflow: 'hidden',
                    }}
                >
                    {/* Glowing effect blobs */}
                    <Box sx={{
                        position: 'absolute',
                        width: '300px',
                        height: '300px',
                        background: 'rgba(255, 152, 57, 0.15)',
                        filter: 'blur(100px)',
                        borderRadius: '50%',
                        top: '20%',
                        left: '20%',
                    }} />

                    <Box sx={{ position: 'relative', zIndex: 1, maxWidth: '550px' }}>
                        <Typography variant="h2" sx={{ fontWeight: 800, mb: 3, letterSpacing: '-1.5px' }}>
                            Welcome to <span style={{ background: 'linear-gradient(135deg, #ff9839 0%, #ff5e62 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Apna Call</span>
                        </Typography>
                        <Typography variant="h6" sx={{ color: 'text.secondary', fontWeight: 400, lineHeight: 1.6 }}>
                            Connect, collaborate, and celebrate from anywhere with high-fidelity, ultra-low latency video meetings.
                        </Typography>
                    </Box>
                </Grid>

                {/* Right Side: Form Card */}
                <Grid 
                    item 
                    xs={12} 
                    sm={8} 
                    md={5} 
                    component={Paper} 
                    elevation={0} 
                    square
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#0f172a',
                    }}
                >
                    <Box
                        sx={{
                            my: 8,
                            mx: 4,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            width: '100%',
                            maxWidth: '400px',
                        }}
                    >
                        <Avatar sx={{ m: 1, bgcolor: 'primary.main', width: 48, height: 48 }}>
                            <LockOutlinedIcon />
                        </Avatar>

                        <Typography variant="h5" sx={{ fontWeight: 700, mb: 3, mt: 1 }}>
                            {formState === 0 ? "Sign In" : "Create Account"}
                        </Typography>

                        {/* Toggle Buttons */}
                        <Box sx={{ display: 'flex', gap: 2, mb: 4, width: '100%', background: 'rgba(255,255,255,0.03)', p: 0.5, borderRadius: '14px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Button 
                                fullWidth
                                variant={formState === 0 ? "contained" : "text"} 
                                onClick={() => { setFormState(0); setError(""); }}
                                sx={{ borderRadius: '10px' }}
                            >
                                Sign In
                            </Button>
                            <Button 
                                fullWidth
                                variant={formState === 1 ? "contained" : "text"} 
                                onClick={() => { setFormState(1); setError(""); }}
                                sx={{ borderRadius: '10px' }}
                            >
                                Sign Up
                            </Button>
                        </Box>

                        <Box component="form" noValidate sx={{ width: '100%' }}>
                            {formState === 1 && (
                                <TextField
                                    margin="normal"
                                    required
                                    fullWidth
                                    id="fullname"
                                    label="Full Name"
                                    name="fullname"
                                    value={name}
                                    autoFocus
                                    onChange={(e) => setName(e.target.value)}
                                />
                            )}

                            <TextField
                                margin="normal"
                                required
                                fullWidth
                                id="username"
                                label="Username"
                                name="username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                            
                            <TextField
                                margin="normal"
                                required
                                fullWidth
                                name="password"
                                label="Password"
                                value={password}
                                type="password"
                                id="password"
                                onChange={(e) => setPassword(e.target.value)}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') handleAuth();
                                }}
                            />

                            {error && (
                                <Typography color="error" variant="body2" sx={{ mt: 2, fontWeight: 500 }}>
                                    {error}
                                </Typography>
                            )}

                            <Button
                                type="button"
                                fullWidth
                                variant="contained"
                                sx={{ 
                                    mt: 4, 
                                    mb: 2,
                                    background: 'linear-gradient(135deg, #ff9839 0%, #e65100 100%)',
                                    boxShadow: '0 4px 14px rgba(255, 152, 57, 0.3)',
                                    color: 'white',
                                    height: '48px',
                                    fontSize: '1rem',
                                    '&:hover': {
                                        boxShadow: '0 6px 20px rgba(255, 152, 57, 0.5)',
                                    }
                                }}
                                onClick={handleAuth}
                            >
                                {formState === 0 ? "Login" : "Register"}
                            </Button>
                        </Box>
                    </Box>
                </Grid>
            </Grid>

            <Snackbar
                open={open}
                autoHideDuration={4000}
                onClose={() => setOpen(false)}
                message={message}
            />
        </ThemeProvider>
    );
}