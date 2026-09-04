import { NavLink, Outlet } from 'react-router-dom';

const mainNavItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/personas', label: 'Personas' },
  { to: '/journeys', label: 'Journeys' },
  { to: '/environments', label: 'Environments' },
];

const resourceNavItems = [
  { to: '/about', label: 'About' },
  { to: '/api-docs', label: 'API Docs' },
];

export default function Layout() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="sidebar-title">Synthetic Users</h1>
        </div>
        <nav className="sidebar-nav">
          {mainNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `nav-link${isActive ? ' nav-link--active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
          <div className="sidebar-section">
            <span className="sidebar-section__label">Resources</span>
            {resourceNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `nav-link${isActive ? ' nav-link--active' : ''}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
