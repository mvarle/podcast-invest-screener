import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getSpeakers } from '../lib/api';

export default function SpeakerList() {
  const [speakers, setSpeakers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getSpeakers()
      .then(setSpeakers)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page"><p className="loading">Loading...</p></div>;
  if (error) return <div className="page"><p className="error">Error: {error}</p></div>;

  return (
    <div className="page">
      <h1>Speakers</h1>
      {speakers.length === 0 && <p className="empty">No speakers found yet.</p>}
      <div className="speaker-grid">
        {speakers.map((speaker) => {
          const winRate = speaker.totalMentions > 0
            ? Math.round((speaker.correctPredictions / speaker.totalMentions) * 100)
            : null;
          return (
            <Link
              key={speaker.name}
              to={`/speakers/${encodeURIComponent(speaker.name)}`}
              className="speaker-card"
            >
              <h3>{speaker.name}</h3>
              <div className="speaker-stats">
                <span>{speaker.totalMentions} mentions</span>
                {winRate !== null && <span>Win rate: {winRate}%</span>}
              </div>
              <div className="speaker-sentiments">
                {speaker.sentiments.bullish && (
                  <span className="mini-badge bullish">{speaker.sentiments.bullish} bullish</span>
                )}
                {speaker.sentiments.bearish && (
                  <span className="mini-badge bearish">{speaker.sentiments.bearish} bearish</span>
                )}
                {speaker.sentiments.hold && (
                  <span className="mini-badge hold">{speaker.sentiments.hold} hold</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
