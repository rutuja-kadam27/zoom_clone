import { useEffect } from "react";
import { useNavigate } from "react-router-dom"

const withAuth = (WrappedComponent) => {
    const AuthComponent = (props) => {
        const router = useNavigate();

        const isAuthenticated = () => {
            return !!localStorage.getItem("token");
        };

        useEffect(() => {
            if (!isAuthenticated()) {
                router("/auth");
            }
        }, [router]);

        if (!isAuthenticated()) {
            return null; // Prevent flash of protected content
        }

        return <WrappedComponent {...props} />;
    };

    return AuthComponent;
};

export default withAuth;