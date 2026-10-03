// Applies the saved theme before the first paint to avoid a flash of the wrong colours.
try {
  if (localStorage.getItem('pureico:theme') === 'light') {
    document.documentElement.dataset.theme = 'light';
  }
} catch (error) {
  // Storage can be blocked; the default dark theme is fine.
}
