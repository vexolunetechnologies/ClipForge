(function(){
  const play = document.getElementById('edPlay');
  const preview = document.getElementById('edPreview');
  const start = document.getElementById('edStart');
  const end = document.getElementById('edEnd');
  if (play && preview) {
    let stopAt = 0;
    play.addEventListener('click', function () {
      if (!preview.src) return;
      const a = Math.max(0, Number(start && start.value) || 0);
      stopAt = Math.max(a + .1, Number(end && end.value) || preview.duration || a + 1);
      preview.currentTime = a;
      preview.play().catch(function(){});
    });
    preview.addEventListener('timeupdate', function () {
      if (stopAt && preview.currentTime >= stopAt) {
        preview.pause();
        stopAt = 0;
      }
    });
  }
})();