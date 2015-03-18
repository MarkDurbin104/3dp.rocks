/****************************************************************************
The MIT License

Copyright 2015 Mark Durbin.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR 
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.  

Image to Lithophane conversion
NEEDS:
        three.js and NormalControls.js  https://github.com/mrdoob/three.js/
        FileSaver.js                    https://github.com/eligrey/FileSaver.js/

Binary STL output from example by:
Paul Kaplan https://gist.github.com/paulkaplan

Class Lithophane {
    public  initPage         Main Initialisation method - entry point
    private getValue         Worker for updateValues gets individual params
    public  updateValues     Take values from UI and apply range checking
    private setupDragNDrop   Setup panel for drag and drop operations
    private setProgress      Update the progress bar and status indicator
    private previewFile      Load the preview image into the drop panel           
    public  createHeightMesh Go through each of the processing steps updating 
                             the progress bar and allowing the UI to refresh
}   
Class Scene3D {
    public  init3D          Setup the 3D scene (called for each new model)
    public  setUp3DScene    Add the model and ground plane into the scene
}
Class ImageMap {
    public  processImage    Do the 2D processing of the clicked image
}
Class LithoBox {
    private processVectors   Create vectors of 2D points from height map
    private processFaces     Create Face Trangles 
    private processUVs       Create UV mapping for material visualisation
    private addBaseSizePos   Add base , set exact size and centre
}
Class STLGenerator {
    public  generateSTL      Create a String containing an ASCII STL blob
    public  createBinSTL     Create a Binary STL blob
    public  saveTxtSTL       Call SaveAs with an ASCII STL Blob
    public  saveBinSTL       Call SaveAs with an Binary STL Blob
}
*****************************************************************************
    // Copy this section into you html page and modify to suit
    // or uncomment here and make it match your html

    // LITHO_StatusMessages and LITHO_InputRanges must be defined
    // or before including main.js in the HTML file

*****************************************************************************/
var LITHO = { REVISION: '14' };
// browserify support
if ( typeof module === 'object' ) {
    module.exports = LITHO;
}

/*******************************************************************************
 * 
 * Class Lithophane
 * 
 */
LITHO.Lithophane = function () {
    //this.setup();
};
LITHO.Lithophane.prototype = { 
    
    constructor: LITHO.Lithophane,
    StatusMessages:{},
    loadProgress:0,
    loadStatus:'',
    modelProgress:0,
    modelStatus:'',
    files:[],
    setup : function() {
        this.scene3d = new LITHO.Scene3D();
        this.droptarget = document.getElementById('droptarget');
        this.outputCanvas = document.createElement('canvas');
        this.progressBar = document.getElementById('loadProgress');
        this.progressState = document.getElementById('progressState');
        this.threeDCanvas = document.getElementById('threedcanvas');
        this.logoImage = document.getElementById('logo');
    },
    supported : {
        draganddrop: 'draggable' in document.createElement('span'),
        filereader: typeof FileReader !== 'undefined'
    },
    acceptedTypes : {
        'image/png': true,
        'image/jpeg': true,
        'image/gif': true,
        'image/bmp': true
    },
    
    // some defalt values - these are overridden by the ones in the HTML file
    // by an initial call to UpdateValues SO modify them in the HTML, not here!
    params : {
        maxOutputDimensionInMM : 100,
        actualThicknessInMM : 5,
        borderThicknessInMM : 0,
        minThicknessInMM : 0.8,
        vertexPixelRatio : 5,
        baseDepth : 0,
        curve: 0, 
        //positive: false,  
        capTop: false,
        heart: false,
        dome: false,
        pillow: false,
        repeatX: 0, 
        repeatY: 0, 
        mirrorRepeat: false,
        flip: false,

        // values calculated from parameters for ease of reading
        borderPixels:  0,
        maxOutputWidth : 0,
        maxOutputDepth : 0,
        maxOutputHeight : 0,
        HeightInMM:0,
        WidthInMM:0,
        ThickInMM:0,
        zScale : 0,
        createIGES:false,
        useContour:false,
        cameraAvailable:false
    },
    
/*******************************************************************************
 * 
 *  public  initPage        Main Initialisation method - entry point
 * @returns {undefined}
 */    
    fireAngularEvent:function (named) {
        var docbody = ((docbody===undefined)||(docbody===null))?document.body:docbody;
        angular.element(docbody).scope().$broadcast(named);
        /*
        function HTMLEventHandler(event) {
            docbody.removeEventListener(event.type,HTMLEventHandler);
            angular.element(docbody).scope().$broadcast(event.type);
        }
        var event=new CustomEvent(named);
        docbody.addEventListener(named,HTMLEventHandler);
        docbody.dispatchEvent(event);*/
    },
    onDeviceReady:function () {
        this.params.cameraAvailable=navigator.camera!==undefined;
        console.log("deviceReady! "+ navigator.camera);
    }, 
    initPage:function (that) {
        if ((that.threeDCanvas===undefined)||(that.threeDCanvas===null)) that.setup();

        document.addEventListener("deviceready", that.onDeviceReady, false);
        that.updateValues(that);
        that.params.threeDCanvas=that.threeDCanvas;
        that.scene3d.init3D(that.params,true);
//        console.log("Running!");
        that.setupDragNDrop();
    },
    Resize:function (that) { 
        if (that.scene3d!==undefined) {
            that.scene3d.resize();
        }
    },
    
/*******************************************************************************
 * 
 *  private getValue        Worker for updateValues gets individual params
 * @param {LITHO_InputRanges} inputRange - object from LITHO_InputRanges var
 * @param {Number} defaultVal - default value for out of range input
 * @returns {Number} value if in range, otherwise default value passed
 */
    /*updatePrompt:function (event) {
        var inputRange=LITHO_InputRanges[event.target.id];
        if ((inputRange.prompt!==undefined)&&(inputRange.prompt!==null)) {
            inputRange.prompt.innerHTML=inputRange.origText+' '+event.target.value;
        }
    },*/
    getValue:function (inputRange, defaultVal) {
        var element = document.getElementById(inputRange.name);
        if (element===null) return defaultVal;
        var rawVal=element.value; 
        if (inputRange.setup===undefined) {
            inputRange.setup=true;
            rawVal=inputRange.startval; 
            element.value=inputRange.startval;
            element.min  =inputRange.lower;
            element.max  =inputRange.upper;
            element.step =inputRange.step;
            if ((element.onchange!=undefined)&&(element.onchange!=null))
                element.onchange(null);
        }
        var value = parseFloat(rawVal);
        if ((value >= inputRange.lower) && (value <= inputRange.upper)) {
            element.className = '';
            return value;
        }
        element.className = 'outRange'; // mark if out of range
        return defaultVal; // and use the passed default value instead
    },
/*******************************************************************************
 * 
 *  public  updateValues    Take values from UI and apply range checking
 * @param {Event} event - click event - unused
 * @returns {undefined}
 */
    updateValues:function (that) {
        var params=that.params;
        
        params.usecurve=0;
        params.capTop=false;
        params.pillow=false;
        params.heart=false;
        params.dome=false;
        params.dometype=0;
        
        switch (params.form) {
            case 'flat' : {
                params.usecurve=0;
            } break;
            case 'inner' : {
                params.usecurve=0-params.curve;
                if (params.usecurve===0) params.usecurve=-90; 
            } break;
            case 'outer' : {
                params.usecurve=params.curve;
                if (params.usecurve===0) params.usecurve=90;
            } break;
            case 'cylinder' : {
                params.usecurve=360;
                params.capTop=true;
            } break;
            case 'pillow' : {
                params.pillow=true;
                params.capTop=true;
                params.usecurve=params.curve;
                if (params.usecurve===0) params.usecurve=30;
            } break;
            case 'dometop' : {
                params.dome=true;
                params.capTop=true;
                params.dometype=1;
                params.usecurve=180;
            } break;
            case 'domeside' : {
                params.dome=true;
                params.capTop=true;
                params.dometype=0;
                params.usecurve=180;
            } break;
            case 'heart' : {
                params.heart=true;
                params.capTop=true;
                params.usecurve=360;
            } break;
        }

        params.borderPixels    = params.vertexPixelRatio * params.borderThicknessInMM;
        params.maxOutputWidth  = params.maxOutputDimensionInMM - params.borderThicknessInMM * 2;
        params.maxOutputDepth  = params.maxOutputDimensionInMM - params.borderThicknessInMM * 2;
        params.maxOutputHeight = params.actualThicknessInMM - params.minThicknessInMM;
        params.HeightInMM      = params.maxOutputDimensionInMM,
        params.WidthInMM       = params.maxOutputDimensionInMM,
        params.ThickInMM       = params.actualThicknessInMM;
        params.zScale          = params.maxOutputHeight / 255;
        
        if (params.image!=undefined) {
            var refreshState=params.refresh;
            params.refresh=0;
            that.onImageClicked(params.image);
            params.refresh=refreshState;
        }
    },
/*******************************************************************************
 * 
 *  private setupDragNDrop  Setup panel for drag and drop operations
 * @returns {undefined}
 */    
    fileEventHandler:function (that,files) {
        that.droptarget = document.getElementById('droptarget');
        that.droptarget.innerHTML='';
        that.previewFiles(files);
    },
    setupDragNDrop:function () {
        var that=this;
        this.previewFiles();
        try {
            if (this.supported.draganddrop) {
                this.droptarget.ondragover = function () {
                    this.className = 'upload-drop-zone drop';
                    return false;
                };
                this.droptarget.ondragend = function () {
                    this.className = 'upload-drop-zone';
                    return false;
                };
                this.droptarget.ondrop = function (e) {
                    this.className = 'upload-drop-zone';
                    e.preventDefault();
                    that.files=e.dataTransfer.files;
                    that.fireAngularEvent('FilesUpdate');
                };
            }
        } catch(e) {}
    },
/*******************************************************************************
 * 
 *  private setProgress     Update the progress bar and status indicator
 * @param {Number} level - 0-100
 * @param {String} state - "loading..." see createHeightMesh() for examples
 * @returns {undefined}
 * 
 * 
 */
    setLoadProgress:function (level, state) {
        try {
            this.loadProgress=level;
            this.loadStatus=state;
            this.fireAngularEvent('LoadProgress');
        } catch(e) {
        }
    },
    setProgress:function (level, state) {
        try {
            this.modelProgress=level;
            this.modelStatus=state;
            this.fireAngularEvent('ModelProgress');
        } catch(e) {
        }
    },
/*******************************************************************************
 * 
 * private previewFiles     Load the preview image into the drop panel           
 * @param {Event} event - image file to load and show the image in the preview
 * @returns {undefined}]
 */
    getImageFromCamera:function (event) {
        var that=event.target.that;
        if ((navigator === undefined)||(navigator.camera === undefined)) {
            return that.onImageClicked(event);
        }
        function onSuccess(imageURI) {
            var image = new Image();
            image.src = imageURI;
            image.onclick = that.onImageClicked;
            image.that=that;
            image.filename = "Camera_Image";
            if (image.naturalWidth > image.naturalHeight) {
                image.width = 250;
            } else {
                image.height = 250;
            }
            that.droptarget.appendChild(image);
            // show alternative message once first file has been dropped
            //that.droptargetaltbg.style.visibility="visible";
            //that.droptargetbg.style.visibility="hidden";
        };
        function onFail(message) {
            alert('Failed because: ' + message);
        };
        console.log("camera available: "+this.cameraAvailable+" "+navigator.camera);
        navigator.camera.getPicture(onSuccess, onFail, { quality: 50, destinationType: Camera.DestinationType.FILE_URI });
    },
    onImageClicked:function (event) {
        var image;
        var that;
        if (event.target!==undefined) {
            image=event.target; // the image was clicked
            that=image.that;
            that.fireAngularEvent('tabChange');
        } else {
            image=event; // the image list was clicked
            that=image.that;
        }
        var repX=(that.params.repeatX!==undefined)?that.params.repeatX:1;
        var repY=(that.params.repeatY!==undefined)?that.params.repeatY:1;
        var sourceWidth=image.naturalWidth*repX;
        var sourceHeight=image.naturalHeight*repY;
        if (sourceWidth > sourceHeight) {
            that.params.xyScale = (that.params.maxOutputWidth / sourceWidth) * that.params.vertexPixelRatio;
            that.params.WidthInMM=that.params.maxOutputDimensionInMM;
            that.params.HeightInMM=that.params.maxOutputDimensionInMM/(sourceWidth/sourceHeight);
        } else {
            that.params.xyScale = (that.params.maxOutputDepth / sourceHeight) * that.params.vertexPixelRatio;
            that.params.HeightInMM=that.params.maxOutputDimensionInMM;
            that.params.WidthInMM=that.params.maxOutputDimensionInMM*(sourceWidth/sourceHeight);
        }
        image.edgeThickness=(that.params.borderPixels===0)?1:that.params.borderPixels;
        that.params.stampWidth=(sourceWidth * that.params.xyScale)/repX;
        that.params.stampHeight=(sourceHeight * that.params.xyScale)/repY;
        that.outputCanvas.width =Math.ceil((sourceWidth  * that.params.xyScale) + (2 * image.edgeThickness));
        that.outputCanvas.height=Math.ceil((sourceHeight * that.params.xyScale) + (2 * image.edgeThickness));                
        that.params.image=image;
        that.params.outputCanvas=that.outputCanvas;
        that.params.threeDCanvas=that.threeDCanvas;
        if (that.params.refresh===1) {
            that.createHeightMesh(that);
        }
    },
    previewFiles:function (files) {
        var that=this; // needed for callbacks
        if (files===undefined) { // allow logo click for testing
            this.logoImage.onclick = that.getImageFromCamera;
            this.logoImage.that=this;
            this.logoImage.filename = 'NestedCube_Logo';        
            return;
        } else {
            //this.files=files;
            for (var f=0,fl=files.length;f<fl;f++) {
                files[f].progress=0;
                if (this.supported.filereader === true && this.acceptedTypes[files[f].type] === true) {
                    var reader = new FileReader();
                    reader.fileindex=f;
                    reader.updateProgress = function (level) {
                        files[this.fileindex].progress=level;
                        var currentprogress=0;
                        for (var i=0,il=files.length;i<il;i++) {
                            currentprogress+=files[i].progress;
                        }
                        currentprogress=currentprogress/files.length;
                        if (currentprogress>99) {
                            that.setLoadProgress(0,'');
                        } else {
                            that.setLoadProgress(currentprogress,that.StatusMessages.loading);
                        }
                    }
                    reader.onprogress = function (event) {
                        var level = (event.loaded / event.total * 100);
                        this.updateProgress(level);
                    };
                    reader.onload = function (event) {
                        var image = new Image();
                        image.src = event.target.result;
                        image.onclick = that.onImageClicked;
                        image.filename = files[this.fileindex].name;
                        image.that=that;
                        if (image.naturalWidth > image.naturalHeight) {
                            image.width = 100;
                        } else {
                            image.height = 100;
                        }
                        files[this.fileindex].image=image;
                        that.droptarget.appendChild(image);
                        this.updateProgress(100);
                    };
                    reader.readAsDataURL(files[f]);
                }
            }
        }
    },
    loadImage:function (event) {
        var files=event.target.files;
        this.previewFiles(files);
    },

/*******************************************************************************
 * 
 *  public  createHeightMesh Go through each of the processing steps updating 
 *                           the progress bar and allowing the UI to refresh
 * @param {Image} image
 * @returns {undefined}
 */
    downloadSTL:function(that) {
        var stlBin;
        var strSTL;
        var stlGenerator;
        var stlFile;
        var params=that.params;
        var lithoGeometry=params.lithoGeometry;
        
        if (lithoGeometry!==undefined) setTimeout(createSTL, 1);
        
        function createSTL() {
            stlFile=params.image.filename+"W"+Math.floor(params.WidthInMM)+"H"+Math.floor(params.HeightInMM)+"T"+Math.floor(params.ThickInMM)+"V"+params.vertexPixelRatio+"B"+params.borderThicknessInMM+"A"+params.baseDepth+"C"+curve+""+(params.positive?"P":"N")+(params.mirror?"M":"S");
            stlGenerator = new LITHO.STLGenerator();
            if (params.stlformat==1) {
                strSTL = stlGenerator.createTxtSTL(lithoGeometry,stlFile,1/params.vertexPixelRatio);
                that.setProgress(50, that.StatusMessages.ASCIIdownload);
                setTimeout(completeASCIIDownload, 1);
            } else {
                stlBin = stlGenerator.createBinSTL(lithoGeometry,1/params.vertexPixelRatio);
                that.setProgress(33, that.StatusMessages.download);
                setTimeout(completeBinDownload, 1);
            }
        }
        function completeBinDownload() {
            var success=stlGenerator.saveBinSTL(stlBin, stlFile);
            if (!success) {
                strSTL = stlGenerator.createTxtSTL(lithoGeometry,stlFile,1/params.vertexPixelRatio);
                that.setProgress(66, that.StatusMessages.ASCIIdownload); 
                setTimeout(completeASCIIDownload, 1);
            } else {
                stlGenerator=undefined;
                stlBin=undefined;
                that.setProgress(0, '');
            }
        }
        function completeASCIIDownload() {
            stlGenerator.saveTxtSTL(strSTL, stlFile);
            stlGenerator=undefined;
            strSTL=undefined;
            that.setProgress(0, '');
        }
    },
    createHeightMesh: function(that) {
        var params=that.params;
        if (params.image===undefined) return;
        var width=params.outputCanvas.width;
        var height=params.outputCanvas.height;
        //var curve=params.curve;
        //var heart=params.heart;
        //var dome=params.dome;
        //var pillow=params.pillow;
        var heightData;
        var contourData;
        var lithoBox;
        
        
        
        // each of the "DoChunkN()" functions splits up the processing so that the progress bar can update
        // an approximate position and status is set in each function before a setTimeout call to the next
        // allowing the UI to update before proceeding
        // ugly, but hey, what's a person to do...
        
        setTimeout(doChunkA,1);
        
        function doChunkA() {
            params.lithoGeometry=undefined;
            that.scene3d.init3D(params,false);
            that.setProgress(10, that.StatusMessages.s1Processing);
            setTimeout(doChunk0,1);
        }
        function doChunk0() {
            var imageMap = new LITHO.ImageMap();
            if ((that.params.createIGES)&&(that.params.useContour)) {
                var contour=document.getElementById('contour');
                contour.edgeThickness=(that.params.borderPixels===0)?1:that.params.borderPixels;
                contour.filename='Contour';
                //contourData=imageMap.processImage(that.outputCanvas, contour,that.params.minThicknessInMM,that.params.zScale,vpRatio,true,that.params.mirror,that.params.repeatX,that.params.repeatY,that.params.mirrorRepeat,that.params.flipRepeat);
            } else {
                contourData=undefined;
            }
            params.heightData=imageMap.processImage(params);
            imageMap=undefined;
            that.setProgress(20, that.StatusMessages.vProcessing);
            setTimeout(doChunk1,1); 
        }
        function doChunk1() {
            lithoBox = new LITHO.LithoBox();
            lithoBox.panelledBack=!that.params.capTop;
            if (that.params.createIGES) {
            } else {
                params.lithoGeometry = new THREE.Geometry();
                params.lithoGeometry.vertices=lithoBox.processVectors(params);
            }
            params.heightData=undefined; 
            if (that.params.createIGES) {
                that.setProgress(70, that.StatusMessages.aScene);
                setTimeout(doChunk6, 1);
            } else {
                that.setProgress(30, that.StatusMessages.fProcessing);
                setTimeout(doChunk2, 1);
            }
        }
        function doChunk2() {
            params.lithoGeometry.faces=lithoBox.processFaces(params);
            that.setProgress(40, that.StatusMessages.sProcessing);
            setTimeout(doChunk3, 1);
        }
        function doChunk3() {
            params.lithoGeometry.faceVertexUvs[0]=lithoBox.processUVs(params);
            that.setProgress(50, that.StatusMessages.cfNormals);
            setTimeout(doChunk4, 1);
        }
        function doChunk4() {
            //console.log("verts="+lithoGeometry.vertices.length+" faces="+lithoGeometry.faces.length+" uvs="+lithoGeometry.faceVertexUvs[0].length);
            params.lithoGeometry.mergeVertices();
            params.lithoGeometry.computeFaceNormals();
            that.setProgress(60, that.StatusMessages.cvNormals);
            setTimeout(doChunk5, 1);
        }
        function doChunk5() {
            params.lithoGeometry.computeVertexNormals();
            lithoBox.addBaseSizePos(params);
            lithoBox=undefined;
            that.setProgress(70, that.StatusMessages.aScene);
            setTimeout(doChunk6, 1);
        }
        function doChunk6() {
            that.scene3d.init3D(params,false);
            that.scene3d.setUp3DScene(params.lithoGeometry, params.vertexPixelRatio);
            if ((that.params.createIGES)||(params.autodownload!==1)) {
                //lithoGeometry=undefined;
                that.setProgress(0, '');
            } else {
                that.setProgress(80, that.StatusMessages.createSTL);
                that.downloadSTL(that);
            }
        }
    }
};

/*******************************************************************************
 * 
 * Class Scene3D 
 * @returns {undefined}
 */
LITHO.Scene3D = function () {
};
LITHO.Scene3D.prototype = {
    
    constructor: LITHO.Scene3D,
    
    loadingSTL : false,
    STLMesh:undefined,
    renderer : undefined,
    scene : undefined,
    camera : undefined,
    controls : undefined,
    container: undefined,
    compatibilitymode:false,
    currentWidth:0,
    currentHeight:0,
/*******************************************************************************
 * public  init3D - Setup the 3D scene (called for each new model)
 * @param {div} threeDCanvas - the 3D display canvas
 * @param {Number} vertexPixelRatio
 * @param {Boolean} createBox - create a dummy lithophane for empty startup scene
 * @returns {undefined}
 */
    resize : function () { 
        var width = this.container.clientWidth;
        var height = this.container.clientHeight;
        if (((width!==undefined)&&(width!==0)&&(width!==this.currentWidth))||((height!==undefined)&&(height!==0)&&(height!==this.currentHeight))) {
            this.currentWidth=width;
            this.currentHeight=height;
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height);
            this.controls = new THREE.TrackballControls(this.camera, this.container);
            this.controls.rotateSpeed = 2;
            this.controls.zoomSpeed = 2;
            this.controls.staticMoving=true;
        }
    },
    init3D : function (params,createBox) {
        var threeDCanvas = params.threeDCanvas;
        var vertexPixelRatio = params.vertexPixelRatio;
        var that=this; // needed for call back functions
        function render() {
            that.controls.update();
            requestAnimationFrame(render);
            that.renderer.render(that.scene, that.camera);
        };
        function resizer() {
            that.resize();
        }
        this.container = threeDCanvas;
        var width = parseInt(window.getComputedStyle(this.container).width);
        var height = parseInt(window.getComputedStyle(this.container).height);
        if (!this.compatibilitymode) {
            this.container.innerHTML = "";
        }
        
        try {
            this.renderer = new THREE.WebGLRenderer({ antialias: false });
            this.renderer.setClearColor(0xFFFFFF);
            this.container.appendChild(this.renderer.domElement);
            this.renderer.setSize(width, height);
            this.renderer.autoClear = true;
        }
        catch (e) {
            alert(e);
            try {
                if (!this.compatibilitymode) {
                    var compatibilityCanvas = document.getElementById("CompatibilityCanvas");
                    this.renderer = new THREE.CanvasRenderer( {canvas:compatibilityCanvas });
                    this.renderer.setClearColor(0xFFFFFF);
                    this.renderer.setSize(width, height);
                    this.renderer.autoClear = true;
                    this.compatibilitymode=true;
                }
            } catch (e) {
                this.container.innerHTML=that.StatusMessages.WebGLNeeded;
                alert(e);
            }
        }
        
        if ((this.camera===undefined)||(!this.compatibilitymode)) {
            this.camera = new THREE.PerspectiveCamera(37.5, width / height, 1, 5000);
            this.controls = new THREE.TrackballControls(this.camera, this.container);
            this.controls.rotateSpeed = 2;
            this.controls.zoomSpeed = 2;
            this.controls.staticMoving=true;
        }
/*        // should get the Canvas Renderer working for other browsers...
        //if ((Detector!==undefined) && (! Detector.webgl) ) Detector.addGetWebGLMessage();
        
        this.container = threeDCanvas;
        var width = parseInt(window.getComputedStyle(this.container).width);
        var height = parseInt(window.getComputedStyle(this.container).height);
        this.container.innerHTML = "";
        
        this.renderer = new THREE.WebGLRenderer({ antialias: false });
        this.renderer.setClearColor(0xFFFFFF);
        this.renderer.setSize(width, height);
        this.renderer.autoClear = true;
        this.container.appendChild(this.renderer.domElement);
        
        this.camera = new THREE.PerspectiveCamera(37.5, width / height, 1, 5000);
        this.controls = new THREE.NormalControls(this.camera, this.container);*/
        
        if (createBox) {
            var lithoGeometry = new THREE.BoxGeometry(100*vertexPixelRatio,100*vertexPixelRatio,5*vertexPixelRatio);
            lithoGeometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, 2.5*vertexPixelRatio));
        }
        else {
            var lithoGeometry = new THREE.Geometry();
        }
        this.setUp3DScene(lithoGeometry, vertexPixelRatio);
        render();
        window.addEventListener('resize', resizer,false);
    },
/*******************************************************************************
 * 
 * public  setUp3DScene    Add the model and ground plane into the scene
 * @param {Geometry} lithoMesh - the geometry to add to the scene
 * @param {Number} vertexPixelRatio
 * @returns {undefined}
 */    
    setUp3DScene: function(lithoMesh,vertexPixelRatio) {
        try {
            this.scene = new THREE.Scene();
            
            var showFloor=true;
            if (showFloor) {
                var baseWidth = 300*vertexPixelRatio;
                var divisions = Math.floor(baseWidth / (vertexPixelRatio * 10)); // 10mm grid
                var groundMaterial = new THREE.MeshLambertMaterial({ color: 0x808080, wireframe: true , side: THREE.DoubleSide});
                var groundPlane = new THREE.PlaneGeometry(baseWidth, baseWidth, divisions, divisions);
                groundPlane.applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, -0.05));// move down a fraction so that object shows properly from underneath the floor
                var ground = new THREE.Mesh(groundPlane, groundMaterial);
                this.scene.add(ground);
            }
            
            var spotLight = new THREE.SpotLight(0xffffff, 1, 0);
            spotLight.position.set(-1000, 1000, 1000);
            spotLight.castShadow = false;
            this.scene.add(spotLight);
            var pointLight = new THREE.PointLight(0xffffff, 1, 0);
            pointLight.position.set(3000, -4000, 3500);
            this.scene.add(pointLight);
            
            var addBackLights=true;
            if (addBackLights) {
                var spotLight = new THREE.SpotLight(0xffffff, 1, 0);
                spotLight.position.set(-1000, 1000, -1000);
                spotLight.castShadow = false;
                this.scene.add(spotLight);
                var pointLight = new THREE.PointLight(0xffffff, 1, 0);
                pointLight.position.set(3000, -4000, -3500);
                pointLight.castShadow = false;
                this.scene.add(pointLight);
            }
            var material = new THREE.MeshPhongMaterial({ color: 0x001040, specular: 0x006080, side: THREE.DoubleSide,shininess: 10 });//
            var lithoPart = new THREE.Mesh(lithoMesh, material);
            this.scene.add(lithoPart);
            
            var showOverMesh = false;
            if (showOverMesh) {
                var meshmaterial = new THREE.MeshPhongMaterial({ color: 0xFFFFFF, specular: 0x006080, shininess: 10, side: THREE.DoubleSide, wireframe: true });
                var lithoMeshPart = new THREE.Mesh(lithoPart.geometry, meshmaterial);
                this.scene.add(lithoMeshPart);
            }
            
            // TODO - Fix to show goemetry in camera better
            this.camera.position.x = 0;
            this.camera.position.y = -150*vertexPixelRatio;
            this.camera.position.z = 150*vertexPixelRatio;
        }
        catch (e) {
            console.log(e.message);
        }
    }
};

/*******************************************************************************
 * Class ImageMap 
 * @returns {undefined}
 */
LITHO.ImageMap = function () {
};

LITHO.ImageMap.prototype = {
    
    constructor: LITHO.ImageMap,
/*******************************************************************************
 * public  processImage         Do the 2D processing of the clicked image
 * @param {Canvas}              outputCanvas for display of inverted mono image
 * @param {Image} image         the image to process
 * @param {Number} minThicknessInMM
 * @param {Number} zScale
 * @param {Number} vertexPixelRatio
 * @param {Number} positive
 * @param {Number} dontMirror
 * @returns {heightData}
 */
    layoutImage: function(image,context,imageX,imageY,offsetX,offsetY,repX,repY,mirrorRep,flipRep,dontMirror,flip) {
        for (var x=0;x<repX;x++) {
            for (var y=0;y<repY;y++) {
                var mirroring=((mirrorRep)&&(x%2===((dontMirror)?1:0)));
                var flipping=((flipRep)&&(y%2===((flip)?0:1)));
                context.save();
                context.scale(mirroring?-1:1,flipping?-1:1);
                context.drawImage(image,mirroring?(0-imageX)-(offsetX+imageX*x):(offsetX+imageX*x),flipping?(0-imageY)-(offsetY+imageY*y):(offsetY+imageY*y),imageX,imageY);
                context.restore();
            }
        }
    },
    processImage: function(params) {
        
        var outputCanvas=params.outputCanvas;
        var image=params.image;
        var minThicknessInMM=params.minThicknessInMM;
        var zScale=params.zScale;
        var vertexPixelRatio=params.vertexPixelRatio;
        var positive=params.positive===1;
        var dontMirror=(params.mirror===0);
        var flip=params.flip===1;
        var stampWidth=params.stampWidth;
        var stampHeight=params.stampHeight;
        var repeatX=params.repeatX;
        var repeatY=params.repeatY;
        var mirrorRep=params.mirrorRepeat===1;
        var flipRep=params.flipRepeat===1;

        // we'll need the 2D context to manipulate the data
        var canvas_context = outputCanvas.getContext("2d");
        canvas_context.beginPath();
        canvas_context.lineWidth = "1";
        canvas_context.fillStyle = "black";
        canvas_context.rect(0, 0, outputCanvas.width, outputCanvas.height);
        canvas_context.fill();
        //fill the canvas black then place the image in the centre leaving black pixels to form the border
        this.layoutImage(image,canvas_context,stampWidth,stampHeight,image.edgeThickness,image.edgeThickness,repeatX,repeatY,mirrorRep,flipRep,dontMirror,flip);
    
        //canvas_context.drawImage(image, image.edgeThickness, image.edgeThickness, outputCanvas.width - 2 * image.edgeThickness, outputCanvas.height - 2 * image.edgeThickness); // draw the image on our canvas

        if (params.usecurve>0) dontMirror=!dontMirror;
        if ((params.dome)&&(params.dometype===0)) flip=!flip;
        
        // image_data points to the image metadata including each pixel value
        var image_data = canvas_context.getImageData(0, 0, outputCanvas.width, outputCanvas.height);

        // pixels points to the canvas pixel array, arranged in 4 byte blocks of Red, Green, Blue and Alpha channel
        var pixels = image_data.data;
        var numb_pixels = pixels.length / 4; // the number of pixels to process

        var heightData = new Float32Array(numb_pixels); // an array to hold the result data

        var image_pixel_offset = 0; // current image pixel being processed
        var height_pixel_index = 0; // current position in the height data
        for (var y = 0, h = image_data.height; y < h; y++) {
            for (var x = 0, w = image_data.width; x < w; x++) {
                image_pixel_offset = (((flip?(h-1)-y:y)*w)+(dontMirror ? (w-1) - x : x))*4;
                height_pixel_index = x + (((h - 1) - y) * w);
                //height_pixel_index=(dontMirror?w-x:x)+(y*w);
                // extract red,green and blue from pixel array
                var red_channel = pixels[image_pixel_offset], green_channel = pixels[image_pixel_offset + 1], blue_channel = pixels[image_pixel_offset + 2];
                // create negative monochrome value from red, green and blue values
                var negative_average;
                if (positive) {
                    negative_average = (red_channel * 0.299 + green_channel * 0.587 + blue_channel * 0.114);
                } else {
                    negative_average = 255 - (red_channel * 0.299 + green_channel * 0.587 + blue_channel * 0.114);
                }
                //heightData[height_pixel_index] = negative_average; 
                heightData[height_pixel_index] = (minThicknessInMM + (negative_average * zScale)) * vertexPixelRatio; // store scaled value in height array

                // store value back in canvas in all channels for 2D display of negative monochrome image
                pixels[image_pixel_offset] = pixels[image_pixel_offset + 1] = pixels[image_pixel_offset + 2] = negative_average;
                image_pixel_offset += 4; // offest of next pixel in RGBA byte array
            }
        }
        // display modified image
        canvas_context.putImageData(image_data, 0, 0, 0, 0, image_data.width, image_data.height);
        return (heightData);
    }
};

/*******************************************************************************
 * 
 * Class LithoBox 
 * @param {Lithophane} parent
 * 
 */
LITHO.LithoBox = function (parent) {
    this.parentLitho=parent;
    this.panelledBack=false;
    this.capTopIndex=-1;
};
LITHO.LithoBox.prototype = {
    
    constructor: LITHO.LithoBox,
   
/*******************************************************************************
 * 
 *  private processVectors   Create vectors of 2D points from height map
 * @param {Array} heightData  The height data extracted from the image
 * @param {Number} width       The width (X)of the height date
 * @param {Number} height      the height(Y) of the height data
 * @param {Number} curve
 * @param {Number} capTop
 * @returns {verts}         Geometry.vertices array to process
 */
    processVectors: function (params) {
        var heightData=params.heightData;
        var width=params.outputCanvas.width;
        var height=params.outputCanvas.height;
        var curve=params.usecurve;
        var capTop=params.capTop;
        var heart=params.heart;
        var dome=params.dome;
        var pillow=params.pillow;
        var dometype=params.dometype;
        var i, j;
        var index = 0;
        var heightPixels = height;
        var widthPixels = width;
        var domeRatio = 1;
        height--;
        width--;



        if (curve !== 0) {
            var deg2Rad = (Math.PI / 180);
            var angle = Math.abs(curve);
            var arcRadius = (width / curve) * (180 / Math.PI);
            var yarcRadius = (height / curve) * (180 / Math.PI);
            var distanceFromFlat = Math.sin(angle * (360 / Math.PI)) * arcRadius;
            if (angle >= 180)
                distanceFromFlat = 0;
            var startAngle = (0 - angle / 2);
            if (curve < 0)
                distanceFromFlat = 0 - distanceFromFlat;
            var lowestPoint = arcRadius * Math.cos(startAngle * deg2Rad) * Math.cos(startAngle * deg2Rad);
            //console.log("domeRatio=" + domeRatio + "angle=" + angle + " distance " + distanceFromFlat + " arcRadius=" + arcRadius);
        }
        //var lowestPoint=10000;
        var verts = [];
        verts.length = height * width;
        var height_pixel_index;
        for (i = 0; i <= height; i++) {
            for (j = 0; j <= width; j++) {
                var height_pixel_index = j + ((height - i) * widthPixels);
                if ((i === 0) || (i === height) || (((j === 0) || (j === width)))) { // make sure the edge pixels go down to the base
                    heightData[height_pixel_index] = 0;
                }

                var y = heightPixels - i;
                // square up top/bottom edges
                if (y === 2)
                    y--;
                if (y === height)
                    y++;

                var z, x;
                if (curve === 0) {
                    var x = widthPixels - j;
                    z = heightData[height_pixel_index];
                    // square up left/right edges
                    if (x === 2)
                        x--;
                    if (x === width)
                        x++;
                } else {
                    var jpos = j;
                    var ipos = i;
                    //square up left/right edges
                    if (j === 1)
                        jpos--;
                    else if (j === width - 1)
                        jpos++;
                    if (i === 1)
                        ipos--;
                    else if (i === height - 1)
                        ipos++;

                    var u = jpos / width;
                    var degreesRotated = startAngle + (angle * u);
                    var rotation = degreesRotated * deg2Rad;
                    var magnitude = arcRadius + heightData[height_pixel_index];
                    var ymagnitude = yarcRadius + heightData[height_pixel_index];
                    if (pillow) {
                        var v = 1-(ipos / height);
                        var ydegreesRotated = startAngle + (angle * v);
                        var yrotation = ydegreesRotated * deg2Rad;

                        x = magnitude * Math.sin(rotation);
                        y = ymagnitude * Math.sin(yrotation);
                        z = magnitude * Math.cos(rotation) * Math.cos(yrotation);//magnitude

                        if ((i === 0) || (i === height) || (j === 0) || (j === width)) {
                            z = lowestPoint;
                        }
                    } else if ((dome)&&(dometype==0)) {
                         var u=(jpos/width);
                         var degreesRotated=360*u;
                         var rotation=degreesRotated*deg2Rad;
                         var v=(ipos/height);
                         var ydegreesRotated=(90-(90/domeRatio))+((90/domeRatio)*v);
                         var yrotation=ydegreesRotated*deg2Rad;
                         
                         x=magnitude*domeRatio*Math.cos(yrotation)*Math.cos(rotation);
                         y=magnitude*domeRatio*Math.cos(yrotation)*Math.sin(rotation);
                         z=magnitude*Math.sin(yrotation);
                         
                    } else if ((dome)&&(dometype==1)) {
                        var u = (jpos / width);
                        var degreesRotated = 180 * u;
                        var rotation = degreesRotated * deg2Rad;
                        var v = (ipos / height);
                        var ydegreesRotated = 90 + (180 * v);
                        var yrotation = ydegreesRotated * deg2Rad;

                        x = magnitude * domeRatio * Math.cos(yrotation) * Math.cos(rotation);
                        y = magnitude * domeRatio * Math.cos(yrotation) * Math.sin(rotation);
                        z = magnitude * Math.sin(yrotation);
                    } else if (heart) {
                        x = width / 2 + magnitude * ((16 * Math.sin(rotation) * Math.sin(rotation) * Math.sin(rotation)) / 16);
                        z = distanceFromFlat + magnitude * ((13 * Math.cos(rotation) - 5 * Math.cos(2 * rotation) - 2 * Math.cos(3 * rotation) - Math.cos(4 * rotation)) / 16);
                    } else {
                        x = width / 2 + magnitude * Math.sin(rotation);
                        z = distanceFromFlat + magnitude * Math.cos(rotation);
                    }
                }
                verts[index] = new THREE.Vector3(x, y, z);
                index++;
            }
        }
        if (capTop) {
            this.capTopIndex = index;
            if (pillow || dome) {
                verts[index  ] = new THREE.Vector3(0,0,lowestPoint);
            } else {
                verts[index++] = new THREE.Vector3(width / 2, heightPixels, 0);
                verts[index  ] = new THREE.Vector3(width / 2, 1, 0);
            }
        }
        return verts;
    },
/*******************************************************************************
 * 
 * private processFaces     Create Face Trangles 
 * @param {type} width       The width (X)of the height date
 * @param {type} height      the height(Y) of the height data
 * @param {Number} capTop
 * @param {Number} curve
 * @returns {faces}
 */
    processFaces: function(params) {
        var width=params.outputCanvas.width;
        var height=params.outputCanvas.height;
        var curve=params.usecurve;
        var capTop=params.capTop;
        var heart=params.heart;
        var dome=params.dome;
        var pillow=params.pillow;
        var dometype=params.dometype;
        
        var i, j;
        var index = 0;
        var heightPixels = height;
        var widthPixels = width;
        height--;
        width--;
        var a, b, c, d;
        var yoffset = 0;
        var y1offset = widthPixels;

        var faces = [];
        faces.length = (height * width * 2);
        //faces.length = (height * width * 2)+(this.panelledBack?width*2:0);

        for (i = 0; i < height; i++) {
            var xoffset = 0;
            var x1offset = 1;
            for (j = 0; j < width; j++) {
                // select 4 vertice indexes
                if ((curve > 0) || (capTop)) {
                    a = yoffset + x1offset;
                    b = yoffset + xoffset;
                    c = y1offset + xoffset;
                    d = y1offset + x1offset;
                } else {
                    a = yoffset + xoffset;
                    b = yoffset + x1offset;
                    c = y1offset + x1offset;
                    d = y1offset + xoffset;
                }
                // add faces
                // special case for bottom left and top right corners
                // where the triangle's hypotenuse cuts across the corner
                // rotate the face 90 degrees so that the output
                // has nice sharp corners
                if (((j === 0) && (i === 0)) || ((j === width - 1) && (i === height - 1))) {
                    faces[index++] = new THREE.Face3(a, b, c);
                    faces[index++] = new THREE.Face3(c, d, a);
                } else {
                    faces[index++] = new THREE.Face3(a, b, d);
                    faces[index++] = new THREE.Face3(b, c, d);
                }

                if (capTop) {
                    if (pillow || dome) {
                        if (i===0) {
                            if (j===0) {
                                a = this.capTopIndex; faces[index++] = new THREE.Face3(c, b, a);
                            } else if (j===width-1) {
                                b = this.capTopIndex; faces[index++] = new THREE.Face3(b, a, d);
                            } else {
                                c = this.capTopIndex; faces[index++] = new THREE.Face3(b, a, c);
                            }
                        } else if (j===0) {
                            a = this.capTopIndex; faces[index++] = new THREE.Face3(c, b, a);
                        } else if (j===width-1) {
                            b = this.capTopIndex; faces[index++] = new THREE.Face3(b, a, d);
                        } else if (i===height-1) {
                            b = this.capTopIndex; faces[index++] = new THREE.Face3(d, c, b);
                        }
                    } else {
                        if (i === 0) {
                            b = this.capTopIndex;
                            faces[index++] = new THREE.Face3(b, c, d);
                        } else if (i === height - 1) {
                            c = this.capTopIndex + 1;
                            faces[index++] = new THREE.Face3(a, b, c);
                        }
                    }
                } else if (this.panelledBack) {
                    if (i === height - 1) {
                        if (curve > 0) {
                            a = y1offset + x1offset;
                            b = y1offset + xoffset;
                            c = xoffset;
                            d = x1offset;
                        } else {
                            a = y1offset + xoffset;
                            b = y1offset + x1offset;
                            c = x1offset;
                            d = xoffset;
                        }
                        faces[index++] = new THREE.Face3(b, c, d);
                        faces[index++] = new THREE.Face3(a, b, d);
                    }
                }
                xoffset++;
                x1offset++;
            }
            yoffset += widthPixels;
            y1offset += widthPixels;
        }
        return faces;
    },
/*******************************************************************************
 * 
 *  private processUVs       Create UV mapping for material visualisation
 * @param {type} width       The width (X)of the height date
 * @param {type} height      the height(Y) of the height data
 * @param {Number} capTop
 * @returns {UVs}
 */
    processUVs: function(params) {
        var width=params.outputCanvas.width;
        var height=params.outputCanvas.height;
        var curve=params.usecurve;
        var capTop=params.capTop;
        var heart=params.heart;
        var dome=params.dome;
        var pillow=params.pillow;
        var dometype=params.dometype;
        var i, j;
        var index = 0;
        height--;
        width--;
        var uva, uvb, uvc, uvd;
        index = 0;
        var uvs = [];
        uvs.length = height * width * 2;
        //uvs.length = (height+(this.panelledBack?1:0)) * (width+(this.panelledBack?1:0)) * 2;
        for (i = 0; i < height; i++) {
            // UV Array holds values from 0-1
            var yProp = i / height;
            var y1Prop = (i + 1) / height;
            for (j = 0; j < width; j++) {
                // UV Array holds values from 0-1
                var xProp = j / width;
                var x1Prop = (j + 1) / width;
                uva = new THREE.Vector2(xProp, yProp);
                uvb = new THREE.Vector2(x1Prop, yProp);
                uvc = new THREE.Vector2(x1Prop, y1Prop);
                uvd = new THREE.Vector2(xProp, y1Prop);

                // special case for bottom left and top right corners
                // where the triangle's hypotenuse cuts across the corner
                // rotate the face 90 degrees so that the output
                // has nice sharp corners
                if (((j === 0) && (i === 0)) || ((j === width - 1) && (i === height - 1))) {
                    uvs[index++] = [uva, uvb, uvc];
                    uvs[index++] = [uvc.clone(), uvd, uva.clone()];
                } else {
                    uvs[index++] = [uva, uvb, uvd];
                    uvs[index++] = [uvb.clone(), uvc, uvd.clone()];
                }
                if (capTop) {
                    if (pillow || dome) {
                        if ((j === 0) || (i === 0) || (j === width - 1) || (i === height - 1)) {
                            var uvx = new THREE.Vector2(0.5, 0.5);
                            uvs[index++] = [uvx, uvc.clone(), uvd.clone()];
                        }
                    } else {
                        if (i === 0) {
                            var uvx = new THREE.Vector2(0.5, 0.5);
                            uvs[index++] = [uvx, uvc.clone(), uvd.clone()];
                        } else if (i === height - 1) {
                            var uvx = new THREE.Vector2(0.5, 0.5);
                            uvs[index++] = [uva.clone(), uvb.clone(), uvx];
                        }
                    }
                } else if (this.panelledBack) {
                    if (i === height - 1) {
                        yProp = 0;
                        y1Prop = 1;
                        uva = new THREE.Vector2(xProp, yProp);
                        uvb = new THREE.Vector2(x1Prop, yProp);
                        uvc = new THREE.Vector2(x1Prop, y1Prop);
                        uvd = new THREE.Vector2(xProp, y1Prop);
                        uvs[index++] = [uvb.clone(), uvc, uvd.clone()];
                        uvs[index++] = [uva, uvb, uvd];
                    }
                    //centerspoke on back
                    /*if (j===0) {
                     var uvx = new THREE.Vector2(0.5,0.5);
                     uvs[index++] = [uva.clone(),uvd.clone(),uvx];
                     } else if (j===width-1) {
                     var uvx = new THREE.Vector2(0.5, 0.5);
                     uvs[index++] = [uvc.clone(),uvb.clone(),uvx];
                     } 
                     if (i===0) {
                     var uvx = new THREE.Vector2(0.5, 0.5);
                     uvs[index++] = [uvb.clone(),uva.clone(),uvx];
                     } else if (i===height-1) {
                     var uvx = new THREE.Vector2(0.5, 0.5);
                     uvs[index++] = [uvd.clone(),uvc.clone(),uvx];
                     }*/
                }
            }
        }
        return uvs;
    },
/*******************************************************************************
 * 
 *  private addBaseSizePos       Add base , centre and set exact size
 * @param {Geometry} toGeometry  The geomentry to modify
 * @param {Number} WidthInMM  - output width in mm
 * @param {Number} HeightInMM - output height in mm
 * @param {Number} ThickInMM  - output thickness in mm
 * @param {Number} borderThicknessInMM - output border in mm
 * @param {Number} baseDepth - output thickness of base in mm
 * @param {Number} vertexPixelRatio 
 * @param {Number} curve
 * @returns {undefined}
 */
    addBaseSizePos: function(params) {
        var toGeometry=params.lithoGeometry;
        var WidthInMM=params.WidthInMM;
        var HeightInMM=params.HeightInMM;
        var ThickInMM=params.ThickInMM;
        var borderThicknessInMM=params.borderThicknessInMM;
        var baseDepth=params.baseDepth;
        var vertexPixelRatio=params.vertexPixelRatio;
        var curve=params.usecurve;
        var dome=params.dome;
        var dometype=params.dometype;
        var pillow=params.pillow;
        // adjust to exact size required - there is always 1 pixel less on the 
        // width & height due to the vertices being positioned in the middle of each pixel
        toGeometry.computeBoundingBox();
        var gWidth = (toGeometry.boundingBox.max.x - toGeometry.boundingBox.min.x);
        var gHeight = (toGeometry.boundingBox.max.y - toGeometry.boundingBox.min.y);
        var gThick = (toGeometry.boundingBox.max.z - toGeometry.boundingBox.min.z);

        if ((!this.panelledBack) && (curve === 0)) {
            toGeometry.center();
            toGeometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, 0 - toGeometry.boundingBox.min.z));
            //var back=new THREE.PlaneGeometry(gWidth,gHeight,gWidth,gHeight);
            var back = new THREE.PlaneGeometry(gWidth, gHeight, 1, 1);
            //back.applyMatrix(new THREE.Matrix4().makeTranslation(toGeometry.boundingBox.min.x,toGeometry.boundingBox.min.y,toGeometry.boundingBox.min.z));
            back.applyMatrix(new THREE.Matrix4().makeRotationX(Math.PI));
            toGeometry.merge(back);
            toGeometry.mergeVertices();
        }

        if (curve === 0) {
            gWidth /= vertexPixelRatio;
            gHeight /= vertexPixelRatio;
            gThick /= vertexPixelRatio;
            toGeometry.applyMatrix(new THREE.Matrix4().makeScale(WidthInMM / gWidth, HeightInMM / gHeight, ThickInMM / gThick));
            // centre mesh
            toGeometry.center();
            // Place on floor
            toGeometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, ThickInMM * vertexPixelRatio / 2));
            // add a base
            if (baseDepth !== 0) {
                var baseThickness = borderThicknessInMM;
                // if there is no border, add a 2mm thick base
                if (baseThickness === 0) {
                    var baseThickness = 2;
                    // if the base sticks out the front, move the litho up above it
                    if (baseDepth > 0) {
                        toGeometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, baseThickness * vertexPixelRatio, 0));
                    }
                }
                // cube for base
                var lithoBase = new THREE.BoxGeometry(WidthInMM * vertexPixelRatio,
                        baseThickness * vertexPixelRatio,
                        Math.abs(baseDepth) * vertexPixelRatio);
                // move bas to position
                lithoBase.applyMatrix(new THREE.Matrix4().makeTranslation(0, 0 - (HeightInMM - baseThickness) * vertexPixelRatio / 2, (baseDepth * vertexPixelRatio) / 2));
                toGeometry.merge(lithoBase);

            }
        }
        if ((!pillow) && (!dome) && ((curve !== 0) || (baseDepth !== 0))) {
            toGeometry.applyMatrix(new THREE.Matrix4().makeRotationX(Math.PI / 2));
        } else if ((dome)&&(dometype===1)) {
            toGeometry.applyMatrix(new THREE.Matrix4().makeRotationX(0-Math.PI/2 ));
        }
        toGeometry.center();
        toGeometry.computeBoundingBox();
        toGeometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, 0 - toGeometry.boundingBox.min.z));
    }
};
/*******************************************************************************
 * 
 * Class STLGenerator
 * 
 */
LITHO.STLGenerator = function () {
};
LITHO.STLGenerator.prototype = {
    
    constructor: LITHO.STLGenerator,
    
/*******************************************************************************
 * 
 *  public  saveTxtSTL       Call SaveAs with an ASCII STL Blob
 * @param {type} stlString   the string contaning the STL data
 * @param {type} name        The output file name 
 * @returns {undefined}
 */
    saveTxtSTL: function(stlString, name) {
        try {
            var blob = new Blob([stlString], { type: 'text/plain;charset=utf-8' });
            saveAs(blob, name + '.stl');
            return true;
        } catch(e) {
            alert('Failed to download text file:'+e+'.\n\nSorry! ');
        }
        return false;
    },
/*******************************************************************************
 * 
 *  public  saveBinSTL       Call SaveAs with an Binary STL Blob
 * @param {type} dataview    the binary blob contaning the STL data
 * @param {type} name        The output file name 
 * @returns {undefined}
 */
    saveBinSTL: function(dataview, name) {
        try {
            var blob = new Blob([dataview], { type:'application/octet-stream' });
            saveAs(blob, name + '.stl');
            return true;
        } catch(e) {
            alert('Failed to download Binary file:'+e+'.\nTrying ASCII... ');
        }
        return false;
    },
/*******************************************************************************
 * 
 *  public  createTxtSTL      Create a String containing an ASCII STL blob
 * @param {type} geometry    The geometry to process
 * @param {type} name        The output file name (included in the ST file)
 * @param {type} scale       The scale Vertex to MM for output in MM
 * @returns {String}
 */
    createTxtSTL: function(geometry, name,scale) {
        var vertices = geometry.vertices;
        var faces = geometry.faces;
        function vertexAsString(vert) {
            return vert.x * scale + " " + vert.y * scale + " " + vert.z * scale;
        }
        function faceAsString(index) {
            return "facet normal " + vertexAsString(faces[index].normal) + 
                " \nouter loop \n" + 
                "vertex " + vertexAsString(vertices[faces[index].a]) + " \n" + 
                "vertex " + vertexAsString(vertices[faces[index].b]) + " \n" + 
                "vertex " + vertexAsString(vertices[faces[index].c]) + " \n" + 
                "endloop \nendfacet \n";
        }
        var stl = "solid " + name + "\n";
        for (var i = 0; i < faces.length; i++) {
            stl += faceAsString(i);
        }
        stl += ("endsolid " + name + "\n");
        return stl;
    },
/*******************************************************************************
 * 
 *  public  createBinSTL     Create a Binary STL blob
 * @param {type} geometry    The geometry to process
 * @param {type} scale       The scale Vertex to MM for output in MM
 * @returns {LITHO.STLGenerator.prototype.createBinSTL.dv|DataView}
 */
    createBinSTL: function(geometry,scale) {
        var writeVector = function (dataview, offset, vector, isLittleEndian) {
            offset = writeFloat(dataview, offset, vector.x * scale, isLittleEndian);
            offset = writeFloat(dataview, offset, vector.y * scale, isLittleEndian);
            return writeFloat(dataview, offset, vector.z * scale, isLittleEndian);
        };
        var writeFloat = function (dataview, offset, float, isLittleEndian) {
            dataview.setFloat32(offset, float, isLittleEndian);
            return offset + 4;
        };
        var tris = geometry.faces;
        var verts = geometry.vertices;
        var isLittleEndian = true; // STL files assume little endian, see wikipedia page
        var bufferSize = 84 + (50 * tris.length);
        var buffer = new ArrayBuffer(bufferSize);
        var dv = new DataView(buffer);
        var offset = 0;
        offset += 80; // Header is empty
        dv.setUint32(offset, tris.length, isLittleEndian);
        offset += 4;
        for (var n = 0; n < tris.length; n++) {
            offset = writeVector(dv, offset, tris[n].normal  , isLittleEndian);
            offset = writeVector(dv, offset, verts[tris[n].a], isLittleEndian);
            offset = writeVector(dv, offset, verts[tris[n].b], isLittleEndian);
            offset = writeVector(dv, offset, verts[tris[n].c], isLittleEndian);
            offset += 2; // unused 'attribute byte count' is a Uint16
        }
        return dv;
    }
};


LITHO.SplineSurface = function () {
};
LITHO.SplineSurface.prototype = {
    
    constructor: LITHO.SplineSurface,

    SplineKnots: function(knotList,n,degree) {

        for (var j=0,jmax=n+t;j<jmax;j++) {
              if (j < degree)
                 knotList[j] = 0;
              else if (j <= n)
                 knotList[j] = j - degree + 1;
              else if (j > n)
                 knotList[j] = n - degree + 2;	
        }
    }
};