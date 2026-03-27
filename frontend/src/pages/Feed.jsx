import { useState, useEffect } from 'react';
import { getMentions } from '../lib/api';
import MentionCard from '../components/MentionCard';
import Filters from '../components/Filters';

export default function Feed() {
  const [mentions, setMentions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({});

  useEffect(() => {
    setLoading(true);
    setError(null);
    getMentions(filters)
      .then(setMentions)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filters]);

  return (
    <div className="page">
      <h1>Recent Stock Mentions</h1>
      <Filters onApply={setFilters} />
      {loading && <p className="loading">Loading...</p>}
      {error && <p className="error">Error: {error}</p>}
      {!loading && !error && mentions.length === 0 && (
        <p className="empty">No stock mentions found. Check back after podcasts are processed.</p>
      )}
      <div className="mention-grid">
        {mentions.map((mention) => (
          <MentionCard key={mention.id} mention={mention} />
        ))}
      </div>
    </div>
  );
}
