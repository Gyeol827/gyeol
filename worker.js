// Listen for messages from the main thread
self.addEventListener('message', function(e) {
  const data = e.data;
  
  switch (data.cmd) {
    case 'preloadResources':
      preloadResources(data.resources);
      break;
    case 'processData':
      const result = processData(data.value);
      self.postMessage({ type: 'processResult', result: result });
      break;
    default:
      self.postMessage({ type: 'error', message: 'Unknown command' });
  }
}, false);

// Preload resources
function preloadResources(resources) {
  if (!resources || !resources.length) return;
  
  let loaded = 0;
  
  resources.forEach(url => {
    fetch(url, { method: 'HEAD' })
      .then(() => {
        loaded++;
        if (loaded === resources.length) {
          self.postMessage({ type: 'resourcesPreloaded', count: loaded });
        }
      })
      .catch(error => {
        self.postMessage({ type: 'error', message: `Failed to preload ${url}` });
      });
  });
}

// Mock data processing function
function processData(data) {
  // Perform complex calculations in the Worker to reduce main thread load
  return data;
} 