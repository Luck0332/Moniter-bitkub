import Link from 'next/link';

export default function Home() {
  return (
    <div className="landing">
      <div className="landing-inner">
        <div className="landing-logo">L</div>
        <div className="landing-title">Liberix Monitor</div>
        <div className="landing-sub">Loan & Liquidity Monitoring Platform</div>

        <div className="role-grid">
          <Link href="/viewer" className="role-card">
            <div className="role-icon">&#128100;</div>
            <div className="role-name">User</div>
            <div className="role-desc">View and edit your loan details, check LTV and repayment status</div>
          </Link>
          <Link href="/admin" className="role-card">
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
