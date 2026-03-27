import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getEpisodes } from '../lib/api';

export default function EpisodeList() {
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getEpisodes()
      .then(setEpisodes)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page"><p className="loading">Loading...</p></div>;
  if (error) return <div className="page"><p className="error">Error: {error}</p></div>;

  return (
    <div className="page">
      <h1>Episodes</h1>
      {episodes.length === 0 && <p className="empty">No analyzed episodes yet.</p>}
      <div className="episode-list">
        {episodes.map((ep) => (
          <Link key={ep.id} to={`/episodes/${ep.id}`} className="episode-card">
            <div className="episode-info">
              <h3>{ep.title}</h3>
              <div className="episode-meta">
                {ep.podcasts?.name && <span className="episode-podcast">{ep.podcasts.name}</span>}
                {ep.release_date && (
                  <span className="episode-date">
                    {new Date(ep.release_date).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
            <div className="episode-mentions-count">
              {ep.stock_mentions?.[0]?.count || 0} mentions
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
