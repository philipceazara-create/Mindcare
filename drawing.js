(function(){
    var canvas = document.getElementById('drawingCanvas');
    var bgCanvas = document.getElementById('bgCanvas');
    var ctx = canvas.getContext('2d');
    var bgCtx = bgCanvas.getContext('2d');
    var drawing = false;
    var erasing = false;

    var colorPicker = document.getElementById('colorPicker');
    var sizeRange = document.getElementById('sizeRange');
    var clearBtn = document.getElementById('clearBtn');
    var saveBtn = document.getElementById('saveBtn');
    var eraserBtn = document.getElementById('eraserBtn');

    function setDrawingStyle(){
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = parseInt(sizeRange.value, 10) || 3;
        if(erasing){
            ctx.globalCompositeOperation = 'destination-out';
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = colorPicker.value || '#000';
        }
    }

    // undo/redo stacks
    var undoStack = [];
    var redoStack = [];
    var STACK_LIMIT = 30;

    // initialize
    setDrawingStyle();

    // draw initial template (lined by default)
    var templateSelect = document.getElementById('templateSelect');
    // optional tracing image (selected from thumbnails)
    var traceImg = new Image();
    var traceSrc = null;

    function drawTemplate(kind){
        // clear background
        bgCtx.clearRect(0,0,bgCanvas.width,bgCanvas.height);
        bgCtx.fillStyle = '#fff';
        bgCtx.fillRect(0,0,bgCanvas.width,bgCanvas.height);

        // draw tracing image faintly if set
        if(traceSrc && traceImg.complete){
            try{
                bgCtx.save();
                bgCtx.globalAlpha = 0.14;
                // fit image to canvas while preserving aspect
                var sw = traceImg.width, sh = traceImg.height;
                var scale = Math.min(bgCanvas.width / sw, bgCanvas.height / sh);
                var dw = sw * scale, dh = sh * scale;
                var dx = (bgCanvas.width - dw) / 2;
                var dy = (bgCanvas.height - dh) / 2;
                bgCtx.drawImage(traceImg, dx, dy, dw, dh);
                bgCtx.restore();
            }catch(e){console.warn('draw trace image failed', e);}
        }

        bgCtx.strokeStyle = 'rgba(0,0,0,0.08)';
        bgCtx.lineWidth = 1;
        if(kind === 'lined'){
            var spacing = 28 * (bgCanvas.width / 800); // scale spacing with width
            for(var y = spacing; y < bgCanvas.height; y += spacing){
                bgCtx.beginPath();
                bgCtx.moveTo(0, y + 0.5);
                bgCtx.lineTo(bgCanvas.width, y + 0.5);
                bgCtx.stroke();
            }
        } else if(kind === 'grid'){
            var gap = 28 * (bgCanvas.width / 800);
            for(var x = gap; x < bgCanvas.width; x += gap){
                bgCtx.beginPath();
                bgCtx.moveTo(x + 0.5, 0);
                bgCtx.lineTo(x + 0.5, bgCanvas.height);
                bgCtx.stroke();
            }
            for(var yy = gap; yy < bgCanvas.height; yy += gap){
                bgCtx.beginPath();
                bgCtx.moveTo(0, yy + 0.5);
                bgCtx.lineTo(bgCanvas.width, yy + 0.5);
                bgCtx.stroke();
            }
        }
    }
    templateSelect.addEventListener('change', function(){ drawTemplate(templateSelect.value); });
    drawTemplate(templateSelect.value || 'lined');

    // helper to set tracing image when a thumbnail is clicked
    function setTraceImage(url){
        if(!url){ traceSrc = null; drawTemplate(templateSelect.value || 'lined'); return; }
        traceSrc = url;
        traceImg = new Image();
        traceImg.crossOrigin = 'anonymous';
        traceImg.onload = function(){ drawTemplate(templateSelect.value || 'lined'); };
        traceImg.src = url;
    }

    // wire up thumbnails (if present) to open drawing area
    var paperContainer = document.querySelector('.paper-container');
    var toolBarEl = document.querySelector('.tool-bar');
    var closeCanvasBtn = document.getElementById('closeCanvasBtn');
    document.querySelectorAll('.thumb').forEach(function(el){
        el.addEventListener('click', function(){
            var url = el.getAttribute('data-src');
            // show UI
            if(toolBarEl) toolBarEl.style.display = 'flex';
            if(paperContainer) paperContainer.style.display = 'block';
            // set trace image and resize canvases
            setTraceImage(url);
            // clear drawing layer
            try{ ctx.clearRect(0,0,canvas.width,canvas.height); }catch(e){}
            // resize to make crisp
            resizeAllCanvases();
            // scroll to canvas
            setTimeout(function(){
                if(paperContainer) paperContainer.scrollIntoView({behavior:'smooth', block:'center'});
            },120);
        });
    });

    if(closeCanvasBtn){
        closeCanvasBtn.addEventListener('click', function(){
            if(toolBarEl) toolBarEl.style.display = 'none';
            if(paperContainer) paperContainer.style.display = 'none';
            // clear tracing image
            setTraceImage(null);
        });
    }

    // mouse events
    canvas.addEventListener('mousedown', function(e){
        drawing = true;
        // save current state for undo (snapshot)
        tryPushUndo();
        // clear redo stack
        redoStack = [];
        setDrawingStyle();
        ctx.beginPath();
        var rect = canvas.getBoundingClientRect();
        ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    });

    canvas.addEventListener('mousemove', function(e){
        if(!drawing) return;
        var rect = canvas.getBoundingClientRect();
        ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
        ctx.stroke();
    });

    ['mouseup','mouseleave'].forEach(function(ev){
        canvas.addEventListener(ev, function(){
            if(drawing){
                drawing = false;
                ctx.closePath();
            }
        });
    });

    // touch events
    canvas.addEventListener('touchstart', function(e){
        e.preventDefault();
        var t = e.touches[0];
        drawing = true;
        setDrawingStyle();
        var rect = canvas.getBoundingClientRect();
        ctx.beginPath();
        ctx.moveTo(t.clientX - rect.left, t.clientY - rect.top);
    }, {passive:false});

    canvas.addEventListener('touchmove', function(e){
        e.preventDefault();
        if(!drawing) return;
        var t = e.touches[0];
        var rect = canvas.getBoundingClientRect();
        ctx.lineTo(t.clientX - rect.left, t.clientY - rect.top);
        ctx.stroke();
    }, {passive:false});

    canvas.addEventListener('touchend', function(e){
        if(drawing){
            drawing = false;
            ctx.closePath();
        }
    });

    // toolbar events
    colorPicker.addEventListener('input', function(){ if(!erasing) ctx.strokeStyle = colorPicker.value; });
    sizeRange.addEventListener('input', function(){ ctx.lineWidth = parseInt(sizeRange.value,10); });

    var undoBtn = document.getElementById('undoBtn');
    var redoBtn = document.getElementById('redoBtn');

    function tryPushUndo(){
        try{
            if(undoStack.length >= STACK_LIMIT) undoStack.shift();
            undoStack.push(canvas.toDataURL());
        }catch(e){ console.warn('undo snapshot failed', e); }
    }

    function restoreFromDataURL(dataURL){
        var img = new Image();
        img.onload = function(){
            ctx.clearRect(0,0,canvas.width,canvas.height);
            ctx.drawImage(img,0,0,canvas.width,canvas.height);
        };
        img.src = dataURL;
    }

    undoBtn.addEventListener('click', function(){
        if(undoStack.length === 0) return;
        // move current to redo
        try{ redoStack.push(canvas.toDataURL()); }catch(e){}
        var data = undoStack.pop();
        restoreFromDataURL(data);
    });

    redoBtn.addEventListener('click', function(){
        if(redoStack.length === 0) return;
        try{ undoStack.push(canvas.toDataURL()); }catch(e){}
        var data = redoStack.pop();
        restoreFromDataURL(data);
    });

    eraserBtn.addEventListener('click', function(){
        erasing = !erasing;
        eraserBtn.textContent = erasing ? 'Eraser (On)' : 'Eraser';
        setDrawingStyle();
    });

    clearBtn.addEventListener('click', function(){
        tryPushUndo();
        ctx.clearRect(0,0,canvas.width,canvas.height);
    });

    saveBtn.addEventListener('click', function(){
        // combine bg + drawing into one image
        var tmp = document.createElement('canvas');
        tmp.width = canvas.width;
        tmp.height = canvas.height;
        var tctx = tmp.getContext('2d');
        // draw scaled bg then drawing
        tctx.drawImage(bgCanvas, 0, 0, tmp.width, tmp.height);
        tctx.drawImage(canvas, 0, 0, tmp.width, tmp.height);
        var link = document.createElement('a');
        link.download = 'drawing.png';
        link.href = tmp.toDataURL('image/png');
        link.click();
    });

    // make canvas look crisp on high-DPI displays (scale once)
    // responsive resize while preserving content
    function resizeAllCanvases(){
        [bgCanvas, canvas].forEach(function(c){
            // store current content
            var img = document.createElement('canvas');
            img.width = c.width;
            img.height = c.height;
            img.getContext('2d').drawImage(c,0,0);

            // compute css display size
            var cssW = c.clientWidth || parseInt(getComputedStyle(c).width,10) || c.width;
            var cssH = c.clientHeight || parseInt(getComputedStyle(c).height,10) || c.height;
            var ratio = window.devicePixelRatio || 1;
            c.width = Math.floor(cssW * ratio);
            c.height = Math.floor(cssH * ratio);
            c.style.width = cssW + 'px';
            c.style.height = cssH + 'px';
            var ctx2 = c.getContext('2d');
            ctx2.setTransform(1,0,0,1,0,0); // reset
            ctx2.scale(ratio, ratio);
            // draw previous content scaled
            ctx2.drawImage(img, 0, 0, cssW, cssH);
        });
        // redraw template to bg (templates scale automatically since bg cleared in drawTemplate)
        drawTemplate(templateSelect.value || 'lined');
    }

    // initial resize and on window resize
    window.addEventListener('load', resizeAllCanvases);
    window.addEventListener('resize', function(){
        // debounce
        clearTimeout(window._resizeTO);
        window._resizeTO = setTimeout(resizeAllCanvases, 120);
    });

})();