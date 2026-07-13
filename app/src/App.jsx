import { Routes, Route } from 'react-router-dom';
import NavBar from './components/NavBar';
import DeadlockRank from './pages/deadlock-rank';
import DeadlockView from './pages/deadlock-view';
import Docs from './pages/Docs';

function App() {
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<DeadlockView />} />
        <Route path="/deadlock-rank" element={<DeadlockRank />} />
        <Route path="/deadlock-view" element={<DeadlockView />} />
        <Route path="/docs" element={<Docs />} />
      </Routes>
    </>
  );
}

export default App;
