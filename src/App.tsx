import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import HomePage from "./pages/HomePage/HomePage";
import LandingPage from "./pages/LandingPage/LandingPage";
import { Toaster } from "react-hot-toast";

function App() {
    return (
        <Router>
            <div style={styles.container}>
                <Toaster position="top-center" reverseOrder={false} />
                <Routes>
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/map" element={<HomePage />} />
                </Routes>
            </div>
        </Router>
    );
}

const styles = {
    container: {
        height: "100vh",
        width: "100vw",
        margin: 0,
        padding: 0,
    },
};

export default App;
