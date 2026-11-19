import React, { useEffect, useState } from 'react';
import api from '../api';

// Admin view of agencies that have gone quiet. Kenya Watch cannot compel an agency,
// but it can make silence visible and keep asking (the server emails reminders).
export default function OverdueReferrals() {
  const [items, setItems] = useState(null);

  useEffect(() => {
    api.get('/reports/overdue-referrals')
      .then((res) => setItems(res.data.referrals || []))
      .catch(() => setItems([]));
  }, []);

  if (items === null) return null;
  return (
    <section className="kw-page-card" aria-labelledby="overdue-heading">
      <h3 id="overdue-heading">Referrals waiting on an agency</h3>
      {items.length === 0 ? (
        <p className="kw-faded">Every active referral has been acknowledged and updated on time.</p>
      ) : (
        <ul className="kw-admin-attention-list">
          {items.map((item) => (
            <li className="kw-admin-attention-item" key={item.referralId}>
              <div className="kw-admin-attention-copy">
                <strong>{item.trackingReference}</strong> <span className="kw-faded">({item.agency})</span>
                <span>
                  {item.kind === 'unacknowledged'
                    ? `Not acknowledged for ${item.idleDays} days`
                    : `No update for ${item.idleDays} days`}
                </span>
                <span className="kw-admin-attention-meta">
                  {item.lastReminderAt ? `Agency last reminded ${new Date(item.lastReminderAt).toLocaleDateString()}` : 'Agency not yet reminded'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
