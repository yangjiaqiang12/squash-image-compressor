(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────
  const images = [];
  let totalOriginalSize = 0;
  let totalCompressedSize = 0;

  // ── DOM refs ───────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dropZone = $('#dropZone');
  const fileInput = $('#fileInput');
  const browseBtn = $('#browseBtn');
  const previewArea = $('#previewArea');
  const imageList = $('#imageList');
  const controls = $('#controls');
  const qualitySlider = $('#quality');
  const qualityValue = $('#qualityValue');
  const formatSelect = $('#format');
  const maxWidthInput = $('#maxWidth');
  const compressBtn = $('#compressBtn');
  const themeToggle = $('#themeToggle');

  // ── Theme ──────────────────────────────────────────────
  const savedTheme = localStorage.getItem('squash-theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('squash-theme', next);
  });

  // ── Toast ──────────────────────────────────────────────
  let toastContainer = null;
  function getToastContainer() {
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }
    return toastContainer;
  }

  function toast(message, type = 'success') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `${type === 'success' ? '✅' : '❌'} ${message}`;
    getToastContainer().appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.3s';
      setTimeout(() => el.remove(), 300);
    }, 3500);
  }

  // ── File Size Formatting ───────────────────────────────
  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // ── Canvas compression ─────────────────────────────────
  function compressImage(file, quality, format, maxWidth) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let w = img.width;
          let h = img.height;

          if (maxWidth > 0 && w > maxWidth) {
            h = Math.round(h * (maxWidth / w));
            w = maxWidth;
          }

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);

          const mimeType = format === 'auto'
            ? (file.type || 'image/jpeg')
            : format;

          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('Failed to compress'));
              return;
            }
            resolve({
              blob,
              originalSize: file.size,
              compressedSize: blob.size,
              width: w,
              height: h,
              name: file.name,
              originalName: file.name,
              originalExt: file.name.split('.').pop().toLowerCase(),
            });
          }, mimeType, quality / 100);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  // ── Add Images ─────────────────────────────────────────
  function addFiles(files) {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/bmp', 'image/svg+xml', 'image/gif', 'image/tiff'];
    const isPro = localStorage.getItem('squash-pro') === 'true';
    const maxImages = isPro ? 50 : 5;
    let added = 0;

    if (!isPro && images.length >= maxImages) {
      toast('Free limit: 5 images. Unlock PRO — $5.', 'error');
      proPanel.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    Array.from(files).forEach((file) => {
      if (!isPro && images.length + added >= maxImages) {
        toast('Free limit reached. Pay $5 on Ko-fi to unlock.', 'error');
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        toast(`"${file.name}" is too large (max 50MB)`, 'error');
        return;
      }
      if (!validTypes.includes(file.type) && file.type !== '') {
        // Allow unknown types, browser will try
      }
      const exists = images.find((img) => img.name === file.name && img.size === file.size);
      if (exists) return;

      const url = URL.createObjectURL(file);
      images.push({ file, url, name: file.name, size: file.size, compressed: null });
      totalOriginalSize += file.size;
      added++;
    });

    if (added > 0) {
      renderImageList();
      controls.style.display = 'flex';
      toast(`Added ${added} image${added > 1 ? 's' : ''}`, 'success');
    }
  }

  // ── Render ─────────────────────────────────────────────
  function renderImageList() {
    imageList.innerHTML = '';
    images.forEach((img, i) => {
      const ext = getOutputExtension(formatSelect.value, img.file.type);
      const outName = getOutputName(img.name, ext);

      let resultHTML = '';
      if (img.compressed) {
        const saved = img.size - img.compressed.compressedSize;
        const pct = img.size > 0 ? Math.round((saved / img.size) * 100) : 0;
        resultHTML = `
          <div class="image-result">
            <div class="compression-saved">-${pct}%</div>
            <div class="compression-detail">${formatSize(img.size)} → ${formatSize(img.compressed.compressedSize)}</div>
          </div>
        `;
      } else {
        resultHTML = `
          <div class="image-result">
            <div class="compression-detail">${formatSize(img.size)}</div>
            <div class="compression-detail">Pending</div>
          </div>
        `;
      }

      const item = document.createElement('div');
      item.className = 'image-item';
      item.innerHTML = `
        <img src="${img.url}" class="image-preview" alt="${img.name}">
        <div class="image-info">
          <div class="image-name" title="${img.name}">${img.name}</div>
          <div class="image-meta">→ ${outName}</div>
        </div>
        ${resultHTML}
        <div class="image-actions">
          ${img.compressed ? `<button class="btn-download" data-index="${i}">⬇ Download</button>` : ''}
          <button class="btn-remove" data-index="${i}">✕</button>
        </div>
      `;

      item.querySelector('.btn-remove').addEventListener('click', () => removeImage(i));
      if (img.compressed) {
        item.querySelector('.btn-download').addEventListener('click', (e) => {
          e.stopPropagation();
          downloadCompressed(i);
        });
      }

      imageList.appendChild(item);
    });

    previewArea.style.display = images.length > 0 ? 'block' : 'none';
    if (images.length === 0) {
      controls.style.display = 'none';
      totalOriginalSize = 0;
      totalCompressedSize = 0;
    }
  }

  function removeImage(i) {
    const img = images[i];
    totalOriginalSize -= img.size;
    if (img.compressed) {
      totalCompressedSize -= img.compressed.compressedSize;
    }
    URL.revokeObjectURL(img.url);
    images.splice(i, 1);
    renderImageList();
  }

  function getOutputExtension(format, originalType) {
    if (format === 'auto') {
      if (originalType === 'image/jpeg') return 'jpg';
      if (originalType === 'image/png') return 'png';
      if (originalType === 'image/webp') return 'webp';
      return 'jpg';
    }
    if (format === 'image/jpeg') return 'jpg';
    if (format === 'image/png') return 'png';
    if (format === 'image/webp') return 'webp';
    return 'jpg';
  }

  function getOutputName(originalName, ext) {
    const dotIndex = originalName.lastIndexOf('.');
    const base = dotIndex > 0 ? originalName.substring(0, dotIndex) : originalName;
    const suffix = ext === getOriginalExt(originalName) ? '-compressed' : '';
    return `${base}${suffix}.${ext}`;
  }

  function getOriginalExt(name) {
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.substring(dot + 1).toLowerCase() : '';
  }

  function downloadCompressed(i) {
    const img = images[i];
    if (!img.compressed) return;
    const ext = getOutputExtension(formatSelect.value, img.file.type);
    const outName = getOutputName(img.name, ext);
    const url = URL.createObjectURL(img.compressed.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = outName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Downloaded: ${outName}`, 'success');
  }

  // ── Compress All ───────────────────────────────────────
  compressBtn.addEventListener('click', async () => {
    if (images.length === 0) return;

    const quality = parseInt(qualitySlider.value);
    const format = formatSelect.value;
    const maxWidth = parseInt(maxWidthInput.value) || 0;

    compressBtn.disabled = true;
    compressBtn.innerHTML = '<span class="btn-icon">⏳</span> Compressing...';

    totalCompressedSize = 0;
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      try {
        const result = await compressImage(img.file, quality, format, maxWidth);
        img.compressed = result;
        totalCompressedSize += result.compressedSize;
        succeeded++;
      } catch (err) {
        console.error('Failed to compress:', img.name, err);
        failed++;
      }
      renderImageList();
    }

    compressBtn.disabled = false;
    compressBtn.innerHTML = '<span class="btn-icon">⚡</span> Compress All';

    const totalSaved = totalOriginalSize - totalCompressedSize;
    const totalPct = totalOriginalSize > 0 ? Math.round((totalSaved / totalOriginalSize) * 100) : 0;

    if (succeeded > 0) {
      toast(`Compressed ${succeeded} image${succeeded > 1 ? 's' : ''} — saved ${formatSize(totalSaved)} (${totalPct}%)`, 'success');
      // Show donation prompt after successful compression
      if (totalSaved > 1024 * 100) {
        setTimeout(() => {
          toast('☕ Saved space? Support Squash — buy me a coffee!', 'success');
        }, 2000);
      }
    }
    if (failed > 0) {
      toast(`Failed to compress ${failed} image${failed > 1 ? 's' : ''}`, 'error');
    }
  });

  // ── Quality Slider ─────────────────────────────────────
  qualitySlider.addEventListener('input', () => {
    qualityValue.textContent = qualitySlider.value + '%';
  });

  // ── Drop Zone Events ───────────────────────────────────
  dropZone.addEventListener('click', (e) => {
    if (e.target === browseBtn || browseBtn.contains(e.target)) return;
    fileInput.click();
  });

  browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      addFiles(fileInput.files);
      fileInput.value = '';
    }
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  });

  // Global drop support (anywhere on page)
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0 && !dropZone.contains(e.target)) {
      addFiles(e.dataTransfer.files);
    }
  });

  // ── Paste support ──────────────────────────────────────
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        files.push(item.getAsFile());
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  });

  // ── PRO Unlock ─────────────────────────────────────────
  const proPanel = $('#proPanel');
  const proStatus = $('#proStatus');
  const proLocked = $('#proLocked');
  const proUnlocked = $('#proUnlocked');
  const proUnlockBtn = $('#proUnlockBtn');
  const proPayBtn = $('#proPayBtn');

  function checkProStatus() {
    const unlocked = localStorage.getItem('squash-pro') === 'true';
    if (unlocked) {
      proStatus.textContent = 'Active';
      proStatus.style.color = '#10b981';
      if (proLocked) proLocked.style.display = 'none';
      if (proUnlocked) proUnlocked.style.display = 'block';
    }
    return unlocked;
  }

  proPayBtn.addEventListener('click', () => {
    // Track that user initiated payment
    sessionStorage.setItem('squash-paying', '1');
  });

  proUnlockBtn.addEventListener('click', () => {
    // Honor-system unlock — user pays on Ko-fi then clicks here
    localStorage.setItem('squash-pro', 'true');
    proStatus.textContent = 'Active';
    proStatus.style.color = '#10b981';
    proLocked.style.display = 'none';
    proUnlocked.style.display = 'block';
    toast('PRO unlocked! Thanks for your support.', 'success');
  });

  // If returning from Ko-fi payment, auto-unlock
  if (sessionStorage.getItem('squash-paying') === '1') {
    sessionStorage.removeItem('squash-paying');
    if (!checkProStatus()) {
      proUnlockBtn.click();
    }
  }

  checkProStatus();

  // ── Demo mode — load a sample image for first-time visitors ──
  const hasVisited = localStorage.getItem('squash-visited');
  if (!hasVisited) {
    localStorage.setItem('squash-visited', '1');
    // Create a small demo canvas image
    const demoCanvas = document.createElement('canvas');
    demoCanvas.width = 800;
    demoCanvas.height = 600;
    const dctx = demoCanvas.getContext('2d');
    const gradient = dctx.createLinearGradient(0, 0, 800, 600);
    gradient.addColorStop(0, '#6366f1');
    gradient.addColorStop(0.5, '#a855f7');
    gradient.addColorStop(1, '#ec4899');
    dctx.fillStyle = gradient;
    dctx.fillRect(0, 0, 800, 600);
    dctx.fillStyle = 'white';
    dctx.font = 'bold 36px -apple-system, sans-serif';
    dctx.textAlign = 'center';
    dctx.fillText('🎨 Squash Demo Image', 400, 280);
    dctx.font = '18px -apple-system, sans-serif';
    dctx.fillText('This is a sample — drop your own images to compress!', 400, 320);

    demoCanvas.toBlob((blob) => {
      const file = new File([blob], 'squash-demo.png', { type: 'image/png' });
      addFiles([file]);
    }, 'image/png');
  }
})();
