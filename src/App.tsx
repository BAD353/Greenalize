import HomePage from "./pages/HomePage/HomePage";

function App() {
  return <div style={styles.container}>
    <HomePage />
  </div>;
}

const styles = {
  container: {
    height: '100vh',
    width: '100vw',
    margin: 0,
    padding: 0,
  },
};

export default App;
