const isLocalhost = (hostname) => {
    return (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname.startsWith("192.168.") ||
        hostname.startsWith("10.") ||
        // Matches 172.16.x.x through 172.31.x.x (private LAN range)
        (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname))
    );
};

const IS_PROD = !isLocalhost(window.location.hostname);

// Dynamically use the host's IP for local testing so mobile devices connect to the laptop's backend
const server = IS_PROD ?
    (import.meta.env.VITE_BACKEND_URL || "https://meetsphere-backend.onrender.com") :
    `http://${window.location.hostname}:8000`;

export default server;