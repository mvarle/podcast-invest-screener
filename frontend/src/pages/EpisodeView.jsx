import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getEpisode } from '../lib/api';
import MentionCard from '../components/MentionCard';

export default function EpisodeView() {
  const { id } = useParams();
  const [episode, setEpisode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getEpisode(id)
      .then(setEpisode)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="page"><p className="loading">Loading...</p></div>;
  if (error) return <div className="page"><p className="error">Error: {error}</p></div>;
  if (!episode) return <div className="page"><p>Episode not found.</p></div>;

  const mentions = episode.stock_mentions || [];

  return (
    <div className="page">
      <Link to="/episodes" className="back-link">← Back to Episodes</Link>
      <h1>{episode.title}</h1>
      <div className="episode-detail-meta">
        {episode.podcasts?.name && <span>{episode.podcasts.name}</span>}
        {episode.release_date && (
          <span>{new Date(episode.release_date).toLocaleDateString()}</span>
        )}
        <span>{mentions.length} stock mention{mentions.length !== 1 ? 's' : ''}</span>
      </div>

      {mentions.length === 0 ? (
        <p className="empty">No stock mentions extracted from this episode.</p>
      ) : (
        <div className="mention-grid">
          {mentions.map((mention) => (
            <MentionCard key={mention.id} mention={{ ...mention, episodes: episode }} />
          ))}
        </div>
      )}
    </div>
  );
}
