import { Routes, Route } from 'react-router-dom';
import NavBar from './components/NavBar';
import Deadlock from './pages/Deadlock';
import Docs from './pages/Docs';

function App() {
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<Deadlock />} />
        <Route path="/docs" element={<Docs />} />
      </Routes>
    </>
  );
}

export default App;
