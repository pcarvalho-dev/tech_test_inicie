const id = new URLSearchParams(location.search).get('id');
if (!id) {
  document.getElementById('error').style.display = 'block';
} else {
  chrome.storage.local.get(['token'], ({ token }) => {
    fetch(`http://localhost:3000/api/screenshots/${id}/image`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.blob())
      .then((blob) => {
        document.getElementById('img').src = URL.createObjectURL(blob);
      })
      .catch(() => {
        document.getElementById('error').style.display = 'block';
      });
  });
}
