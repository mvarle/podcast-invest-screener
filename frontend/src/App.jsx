import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import Layout from './components/Layout';
import Feed from './pages/Feed';
import MentionDetail from './pages/MentionDetail';
import StockView from './pages/StockView';
import SpeakerList from './pages/SpeakerList';
import SpeakerView from './pages/SpeakerView';
import EpisodeList from './pages/EpisodeList';
import EpisodeView from './pages/EpisodeView';
import Login from './pages/Login';
import './App.css';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Feed />} />
            <Route path="/mentions/:id" element={<MentionDetail />} />
            <Route path="/stocks/:ticker" element={<StockView />} />
            <Route path="/speakers" element={<SpeakerList />} />
            <Route path="/speakers/:name" element={<SpeakerView />} />
            <Route path="/episodes" element={<EpisodeList />} />
            <Route path="/episodes/:id" element={<EpisodeView />} />
            <Route path="/login" element={<Login />} />
          </Routes>
        </Layout>
      </AuthProvider>
    </BrowserRouter>
  );
}
