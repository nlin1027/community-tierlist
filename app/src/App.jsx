import { Routes, Route } from 'react-router-dom';
import NavBar from './components/NavBar';
import DeadlockRank from './pages/deadlock-rank';
import DeadlockView from './pages/deadlock-view';
import DeadlockSearch from './pages/deadlock-search';
import Auth from './pages/Auth';
import Docs from './pages/Docs';

function App() {
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<DeadlockView />} />
        <Route path="/deadlock-rank" element={<DeadlockRank />} />
        <Route path="/deadlock-view" element={<DeadlockView />} />
        <Route path="/deadlock-search" element={<DeadlockSearch />} />
        <Route path="/deadlock-search/:username" element={<DeadlockSearch />} />
        <Route path="/login" element={<Auth />} />
        <Route path="/docs" element={<Docs />} />
      </Routes>
    </>
  );
}

export default App;
