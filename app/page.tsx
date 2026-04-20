import Link from 'next/link';

export default function Home() {
  return (
    <div className="landing-overlay">
      <div className="landing-container">
        <div className="landing-logo">
          <div className="logo-letter" style={{ width: '100%', height: '100%', borderRadius: '22px', fontSize: '2rem' }}>L</div>
        </div>
        <div className="landing-title"><span>Liber</span>ix Monitor</div>
        <div className="landing-subtitle">Open-End Loan & Liquidity Monitoring Platform</div>

        <div className="role-cards">
          <Link href="/viewer" className="role-card user-role">
            <div className="role-icon">&#128100;</div>
            <div className="role-name">User</div>
            <div className="role-desc">View and edit your loan details, check LTV and repayment status</div>
          </Link>
          <Link href="/admin" className="role-card admin-role">
            <div className="role-icon">&#128274;</div>
            <div className="role-name">Admin</div>
            <div className="role-desc">Full loan management, liquidity monitor, and portfolio overview</div>
          </Link>
        </div>

        <div className="landing-footer">v3.0 · Liberix Financial Systems</div>
      </div>
    </div>
  );
}
