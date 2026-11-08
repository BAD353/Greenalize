import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import HomePage from "./pages/HomePage/HomePage";
import LandingPage from "./pages/LandingPage/LandingPage";
import { Toaster } from "react-hot-toast";

// Keyed by city so moving between a preloaded city and the full map starts from a clean page
function PreloadedPage() {
    const { cityId } = useParams();
    return <HomePage key={cityId} preloadedCityId={cityId} />;
}

function App() {
    return (
        <Router>
            <div style={styles.container}>
                <Toaster position="top-center" reverseOrder={false} />
                <Routes>
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/map" element={<HomePage key="map" />} />
                    <Route path="/preloaded/:cityId" element={<PreloadedPage />} />
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
