document.getElementById('settingsForm').addEventListener('submit', function(event) {
    event.preventDefault();

    const serverId = document.getElementById('server_id').value.trim();
    const botToken = document.getElementById('bot_token').value.trim();
    const pageTitle = document.getElementById('pagina_titulo_pagina').value.trim();
    const musicUpload = document.getElementById('music_upload').files[0];

    if (!serverId || !botToken || !pageTitle) {
        showFeedback('error', 'Please fill out all required fields.');
        return;
    }

    if (musicUpload && !musicUpload.name.endsWith('.mp3')) {
        showFeedback('error', 'Only MP3 files are allowed for the music upload.');
        return;
    }

    this.submit();
});

function showFeedback(type, message) {
    const feedbackDiv = document.getElementById('feedback');
    feedbackDiv.className = `feedback ${type}`;
    feedbackDiv.textContent = message;
    feedbackDiv.style.display = 'block';
    setTimeout(() => {
        feedbackDiv.style.display = 'none';
    }, 3000);
}
