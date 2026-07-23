// header.js — renders the top app header and navigation (updated per review)

const NAV_ITEMS = [
  { href: '#/', label: 'Dashboard' },
  { href: '#/giving/list', label: 'Giving' },
  { href: '#/expenses/list', label: 'Expenses' },
  { href: '#/reports', label: 'Reports' },
  { href: '#/settings', label: 'Administration' }
];

export function mountHeader(container){
  if(!container) return;
  container.innerHTML = '';

  // Branding block
  const wrapper = document.createElement('div');
  wrapper.className = 'app-brand';

  const titleWrap = document.createElement('div');
  titleWrap.style.display = 'flex';
  titleWrap.style.flexDirection = 'column';

  const title = document.createElement('div');
  title.innerHTML = `<h1>Nehemiah Project — Treasury Pilot</h1>`;
  titleWrap.appendChild(title);

  // Tagline (ministry language)
  const tagline = document.createElement('div');
  tagline.className = 'app-tagline';
  tagline.textContent = 'Building Strong Foundations for Ministry';
  tagline.style.fontSize = '13px';
  tagline.style.opacity = '0.95';
  tagline.style.marginTop = '6px';
  titleWrap.appendChild(tagline);

  wrapper.appendChild(titleWrap);

  // Navigation
  const nav = document.createElement('nav');
  nav.className = 'app-nav';
  NAV_ITEMS.forEach(item => {
    const a = document.createElement('a');
    a.href = item.href;
    a.textContent = item.label;
    a.addEventListener('click', (e) => {
      // allow hash navigation to proceed; mark active
      setTimeout(() => setActiveNav(item.href), 10);
    });
    nav.appendChild(a);
  });

  // Header actions placeholder (disabled until implemented)
  const actions = document.createElement('div');
  actions.className = 'header-actions';
  // Intentionally do not render Export/Import buttons until implemented

  // assemble header
  container.appendChild(wrapper);
  container.appendChild(nav);
  container.appendChild(actions);

  // mark active nav based on current hash
  setActiveNav(location.hash || '#/');
}

function setActiveNav(href){
  const nav = document.querySelector('.app-nav');
  if(!nav) return;
  nav.querySelectorAll('a').forEach(a => {
    if(a.getAttribute('href') === href) a.classList.add('active');
    else a.classList.remove('active');
  });
}
