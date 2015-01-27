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

    // LITHO_StatusMessages and LITHO_InputRanges must be defined here
    // or before including main.js in the HTML file
    //<script>
        var LITHO_StatusMessages = {
                loading:     'Loading...'                   ,
                s1Processing:'2D processing...'             ,
                vProcessing: 'Processing Vectors...'        ,
                fProcessing: 'Processing Faces...'          ,
                sProcessing: 'Processing Surface...'        ,
                cvNormals:   'Computing Vertex Normals...'  ,
                cfNormals:   'Computing Face Normals...'    ,
                aScene:      'Adding to scene...'           ,
                createSTL:   'Creating STL file...'         ,
                download:    'Downloading...'
        };
        var LITHO_InputRanges = {
            maximumSize:     {name:'miximumSize'    , lower:1   , upper:1000  },
            thickness:       {name:'thickness'      , lower:1   , upper:100   },
            borderThick:     {name:'borderThick'    , lower:0   , upper:50    },
            minLayer:        {name:'minLayer'       , lower:0.1 , upper:10    },
            vectorsPerPixel: {name:'vectorsPerPixel', lower:1   , upper:5     },
            baseDepth:       {name:'baseDepth'      , lower:-50 , upper:50    },
            reFlip:          {name:'reFlip'         , lower:true, upper:false }
        };
    //</script>

*****************************************************************************/
var LITHO = { REVISION: '7' };
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
    this.scene3d = new LITHO.Scene3D();
    // Add references to HTML elements now that they have been set up
    this.droptarget = document.getElementById('droptarget');
    this.outputCanvas = document.getElementById("outputcanvas");
    this.droptargetaltbg = document.getElementById('droptargetaltbg');
    this.droptargetbg = document.getElementById('droptargetbg');
    this.progressBar = document.getElementById('progressBar');
    this.progressState = document.getElementById('progressState');
    this.threeDCanvas = document.getElementById('threedcanvas');
};
LITHO.Lithophane.prototype = {
    
    constructor: LITHO.Lithophane,
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
    maxOutputDimensionInMM : 0,
    actualThicknessInMM : 0,
    borderThicknessInMM : 0,
    minThicknessInMM : 0,
    vertexPixelRatio : 0,
    baseDepth : 0,
    reFlip : false, 
    
    // values calculated from parameters for ease of reading
    borderPixels:  0,
    maxOutputWidth : 0,
    maxOutputDepth : 0,
    maxOutputHeight : 0,
    HeightInMM:0,
    WidthInMM:0,
    ThickInMM:0,
    zScale : 0,
    
/*******************************************************************************
 * 
 *  public  initPage        Main Initialisation method - entry point
 * @returns {undefined}
 */    
    initPage:function () {
        this.setupDragNDrop();
        this.updateValues(undefined);
        this.scene3d.init3D(this.threeDCanvas,this.vertexPixelRatio,true);
    },
    
/*******************************************************************************
 * 
 *  private getValue        Worker for updateValues gets individual params
 * @param {LITHO_InputRanges} inputRange - object from LITHO_InputRanges var
 * @param {Number} defaultVal - default value for out of range input
 * @returns {Number} value if in range, otherwise default value passed
 */
    getValue:function (inputRange, defaultVal) {
        var element = document.getElementById(inputRange.name);
        var value = parseFloat(element.value);
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
    updateValues:function (event) {
        this.maxOutputDimensionInMM = this.getValue(LITHO_InputRanges.maximumSize     , this.maxOutputDimensionInMM   );
        this.actualThicknessInMM    = this.getValue(LITHO_InputRanges.thickness       , this.actualThicknessInMM      );
        this.borderThicknessInMM    = this.getValue(LITHO_InputRanges.borderThick     , this.borderThicknessInMM      );
        this.minThicknessInMM       = this.getValue(LITHO_InputRanges.minLayer        , this.minThicknessInMM         );
        this.vertexPixelRatio       = this.getValue(LITHO_InputRanges.vectorsPerPixel , this.vertexPixelRatio         );
        this.baseDepth              = this.getValue(LITHO_InputRanges.baseDepth       , this.baseDepth                );
        this.reFlip                 = document.getElementById(LITHO_InputRanges.reFlip.name).checked;
        
        // recalculate basic measurements
        this.borderPixels = this.vertexPixelRatio * this.borderThicknessInMM;
        this.maxOutputWidth = this.maxOutputDimensionInMM - this.borderThicknessInMM * 2;
        this.maxOutputDepth = this.maxOutputDimensionInMM - this.borderThicknessInMM * 2;
        this.maxOutputHeight = this.actualThicknessInMM - this.minThicknessInMM;
        this.HeightInMM = this.maxOutputDimensionInMM,
        this.WidthInMM = this.maxOutputDimensionInMM,
        this.ThickInMM = this.actualThicknessInMM;
        this.zScale = this.maxOutputHeight / 255;
    },
/*******************************************************************************
 * 
 *  private setupDragNDrop  Setup panel for drag and drop operations
 * @returns {undefined}
 */    
    setupDragNDrop:function () {
        var that=this;
        if (this.supported.draganddrop) {
            this.droptarget.ondragover = function () {
                this.className = 'hover';
                return false;
            };
            this.droptarget.ondragend = function () {
                this.className = '';
                return false;
            };
            this.droptarget.ondrop = function (e) {
                this.className = '';
                e.preventDefault();
                var files=e.dataTransfer.files;
                for (var i = 0; i < files.length; i++) {
                    that.previewFile(files[i]);
                }
            };
        }
    },
/*******************************************************************************
 * 
 *  private setProgress     Update the progress bar and status indicator
 * @param {Number} level - 0-100
 * @param {String} state - "loading..." see createHeightMesh() for examples
 * @returns {undefined}
 */
    setProgress:function (level, state) {
        this.progressBar.style.visibility = level === 0 ? "hidden" : "visible";
        this.progressBar.value = level;
        this.progressState.innerHTML = state;
    },
/*******************************************************************************
 * 
 * private previewFile     Load the preview image into the drop panel           
 * @param {File} file - image file to load and show the image in the preview
 * @returns {undefined}]
 */
    previewFile:function (file) {
        var reader = new FileReader();
        var that=this; // needed for callbacks
        function onImageClicked(event) {
            var image=event.target; // the image that was clicked
            if (image.naturalWidth > image.naturalHeight) {
                that.xyScale = (that.maxOutputWidth / image.naturalWidth) * that.vertexPixelRatio;
                that.WidthInMM=that.maxOutputDimensionInMM;
                that.HeightInMM=that.maxOutputDimensionInMM/(image.naturalWidth/image.naturalHeight);
            } else {
                that.xyScale = (that.maxOutputDepth / image.naturalHeight) * that.vertexPixelRatio;
                that.HeightInMM=that.maxOutputDimensionInMM;
                that.WidthInMM=that.maxOutputDimensionInMM*(image.naturalWidth/image.naturalHeight);
            }
            image.edgeThickness=(that.borderPixels===0)?1:that.borderPixels;
            that.outputCanvas.width =Math.ceil((image.naturalWidth  * that.xyScale) + (2 * image.edgeThickness));
            that.outputCanvas.height=Math.ceil((image.naturalHeight * that.xyScale) + (2 * image.edgeThickness));                
            that.createHeightMesh(image);
        };
        if (this.supported.filereader === true && this.acceptedTypes[file.type] === true) {
            reader.onprogress = function (event) {
                var level = (event.loaded / event.total * 100);
                that.setProgress(level,LITHO_StatusMessages.loading);
            };
            reader.onload = function (event) {
                var image = new Image();
                image.src = event.target.result;
                image.onclick = onImageClicked;
                image.filename = file.name;
                if (image.naturalWidth > image.naturalHeight) {
                    image.width = 250;
                } else {
                    image.height = 250;
                }
                that.droptarget.appendChild(image);
                // show alternative message once first file has been dropped
                that.droptargetaltbg.style.visibility="visible";
                that.droptargetbg.style.visibility="hidden";
                that.setProgress(0, '');
            };
            reader.readAsDataURL(file);
        }
    },
/*******************************************************************************
 * 
 *  public  createHeightMesh Go through each of the processing steps updating 
 *                           the progress bar and allowing the UI to refresh
 * @param {Image} image
 * @returns {undefined}
 */
    createHeightMesh: function(image) {
        var that=this; // if you don't know what "that"'s for you soon will :(
        var width=this.outputCanvas.width;
        var height=this.outputCanvas.height;
        var vpRatio=this.vertexPixelRatio;
        var stlBin;
        var heightData;
        var lithoGeometry;
        var lithoBox;
        var stlGenerator;
        var corners;
        
        // each of the "DoChunkN()" functions splits up the processing so that the progress bar can update
        // an approximate position and status is set in each function before a setTimeout call to the next
        // allowing the UI to update before proceeding
        // ugly, but hey, what's a person to do...
        
        that.scene3d.init3D(that.threeDCanvas,vpRatio,false);
        that.setProgress(10, LITHO_StatusMessages.s1Processing);
        setTimeout(doChunk0, 1);
        function doChunk0() {
            var imageMap = new LITHO.ImageMap();
            heightData=imageMap.processImage(that.outputCanvas, image);
            imageMap=undefined;
            that.setProgress(20, LITHO_StatusMessages.vProcessing);
            setTimeout(doChunk1, 1);
        }
        function doChunk1() {
            lithoBox = new LITHO.LithoBox();
            lithoGeometry = new THREE.Geometry();
            corners = [];
            lithoGeometry.vertices=lithoBox.processVectors(heightData, width, height,that.minThicknessInMM,that.zScale,vpRatio,that.reFlip,corners);
            heightData=undefined;
            that.setProgress(30, LITHO_StatusMessages.fProcessing);
            setTimeout(doChunk2, 1);
        }
        function doChunk2() {
            lithoGeometry.faces=lithoBox.processFaces(width, height,corners);
            corners=undefined;
            that.setProgress(40, LITHO_StatusMessages.sProcessing);
            setTimeout(doChunk3, 1);
        }
        function doChunk3() {
            lithoGeometry.faceVertexUvs[0]=lithoBox.processUVs( width, height);
            that.setProgress(50, LITHO_StatusMessages.cfNormals);
            setTimeout(doChunk4, 1);
        }
        function doChunk4() {
            lithoGeometry.mergeVertices();
            lithoGeometry.computeFaceNormals();
            that.setProgress(60, LITHO_StatusMessages.cvNormals);
            setTimeout(doChunk5, 1);
        }
        function doChunk5() {
            lithoGeometry.computeVertexNormals();
            that.setProgress(70, LITHO_StatusMessages.aScene);
            setTimeout(doChunk6, 1);
        }
        function doChunk6() {
            lithoBox.addBaseSizePos(lithoGeometry, that.WidthInMM, that.HeightInMM, that.ThickInMM ,that.borderThicknessInMM, that.baseDepth,vpRatio);
            lithoBox=undefined;
            that.scene3d.setUp3DScene(lithoGeometry, vpRatio);
            that.setProgress(80, LITHO_StatusMessages.createSTL);
            setTimeout(doChunk7, 1);
        }
        function doChunk7() {
            stlGenerator = new LITHO.STLGenerator();
            stlBin = stlGenerator.createBinSTL(lithoGeometry,1/vpRatio);
            lithoGeometry=undefined;
            that.setProgress(90, LITHO_StatusMessages.download);
            setTimeout(doChunk8, 1);
        }
        function doChunk8() {
            stlGenerator.saveBinSTL(stlBin, image.filename);
            stlGenerator=undefined;
            stlBin=undefined;
            that.setProgress(0, '');
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
    
    renderer : undefined,
    scene : undefined,
    camera : undefined,
    controls : undefined,
    container: undefined,

/*******************************************************************************
 * public  init3D          Setup the 3D scene (called for each new model)
 * @param {div} threeDCanvas - the 3D display canvas
 * @param {Number} vertexPixelRatio
 * @param {Boolean} createBox - create a dummy lithophane for empty startup scene
 * @returns {undefined}
 */
    init3D : function (threeDCanvas,vertexPixelRatio,createBox) {
        var that=this; // needed for call back functions
        function render() {
            that.controls.update();
            requestAnimationFrame(render);
            that.renderer.render(that.scene, that.camera);
        };
        function Resize(e) {
            var width = parseInt(window.getComputedStyle(that.container).width);
            var height = parseInt(window.getComputedStyle(that.container).height);
            that.camera.aspect = width / height;
            that.camera.updateProjectionMatrix();
            that.renderer.setSize(width, height);
        };
        
        // should get the Canvas Renderer working for other browsers...
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
        this.controls = new THREE.NormalControls(this.camera, this.container);
        
        if (createBox) {
            var lithoGeometry = new THREE.BoxGeometry(100*vertexPixelRatio,100*vertexPixelRatio,5*vertexPixelRatio);
            lithoGeometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, 2.5*vertexPixelRatio));
        }
        else {
            var lithoGeometry = new THREE.Geometry();
        }
        this.setUp3DScene(lithoGeometry, vertexPixelRatio);
        render();
        window.addEventListener('resize', Resize, false);
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
            
            var addBackLights=false;
            if (addBackLights) {
                var spotLight = new THREE.SpotLight(0xffffff, 1, 0);
                spotLight.position.set(-1000, 1000, -1000);
                spotLight.castShadow = false;
                this.scene.add(spotLight);
                var pointLight = new THREE.PointLight(0xffffff, 1, 0);
                pointLight.position.set(3000, -4000, -3500);
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
 * @returns {heightData}
 */
    processImage: function(outputCanvas, image) {

        // we'll need the 2D context to manipulate the data
        var canvas_context = outputCanvas.getContext("2d");
        canvas_context.beginPath();
        canvas_context.lineWidth = "1";
        canvas_context.fillStyle = "black";
        canvas_context.rect(0, 0, outputCanvas.width, outputCanvas.height);
        canvas_context.fill();
        //fill the canvas black then place the image in the centre leaving black pixels to form the border
        canvas_context.drawImage(image, image.edgeThickness, image.edgeThickness, outputCanvas.width - 2 * image.edgeThickness, outputCanvas.height - 2 * image.edgeThickness); // draw the image on our canvas
        
        // image_data points to the image metadata including each pixel value
        var image_data = canvas_context.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
        
        // pixels points to the canvas pixel array, arranged in 4 byte blocks of Red, Green, Blue and Alpha channel
        var pixels = image_data.data;
        var numb_pixels = pixels.length / 4; // the number of pixels to process
        
        heightData = new Uint8Array(numb_pixels); // an array to hold the result data
        
        var image_pixel_offset = 0; // current image pixel being processed
        for (var height_pixel_index = 0; height_pixel_index < numb_pixels; height_pixel_index++) {
            // extract red,green and blue from pixel array
            var red_channel = pixels[image_pixel_offset], green_channel = pixels[image_pixel_offset + 1], blue_channel = pixels[image_pixel_offset + 2];
            // create negative monochrome value from red, green and blue values
            var negative_average = 255 - (red_channel * 0.299 + green_channel * 0.587 + blue_channel * 0.114);
            
            heightData[height_pixel_index] = negative_average; // store calue in height array

            // store value back in canvas in all channels for 2D display of negative monochrome image
            pixels[image_pixel_offset] = pixels[image_pixel_offset + 1] = pixels[image_pixel_offset + 2] = negative_average;
            image_pixel_offset += 4; // offest of next pixel in RGBA byte array
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
    this.centreBack=false;
};
LITHO.LithoBox.prototype = {
    
    constructor: LITHO.LithoBox,
    
/*******************************************************************************
 * 
 *  private processVectors   Create vectors of 2D points from height map
 * @param {Array} heightData  The height data extracted from the image
 * @param {Number} width       The width (X)of the height date
 * @param {Number} height      the height(Y) of the height data
 * @param {Number} minThicknessInMM
 * @param {Number} zScale
 * @param {Number} vertexPixelRatio
 * @param {Number} reFlip
 * @param {Array} corners     indexes of the corners (for the back)
 * @returns {verts}         Geometry.vertices array to process
 */
    processVectors: function (heightData, width, height,minThicknessInMM,zScale,vertexPixelRatio,reFlip,corners) {
        var i, j;
        var index = 0;
        var heightPixels = height;
        var widthPixels = width;
        height--;
        width--;
        var verts=[];
        verts.length = height * width+(this.centreBack?1:0);
        for (i = 0; i <= height; i++) {
            for (j = 0; j <= width; j++) {
                var x=reFlip ? j : widthPixels - j;
                var y=heightPixels - i; 
                // square up edges
                if (x===2) x--;
                if (y===2) y--;
                if (x===width) x++;
                if (y===height) y++;
                
                if ((i===0)||(j===0)||(i===height)||j===width) { // make sure the edge pixels go down to the base
                    //if (((i===0)||(i===height))&&((j===0)||(j===width)))
                    //    corners.push(index); // save the indexes of the 4 corners for the back faces
                    
                    verts[index] = new THREE.Vector3(x, y, 0);
                } else {
                    verts[index] = new THREE.Vector3(x, y, 
                    (minThicknessInMM + (heightData[index] * zScale)) * vertexPixelRatio);
                }
                index++;
            }
        }
        if (this.centreBack) {
            verts[index] = new THREE.Vector3(width/2, height/2, 0);// centre back for edge to cantre back faces
        }
        return verts;
    },
/*******************************************************************************
 * 
 * private processFaces     Create Face Trangles 
 * @param {type} width       The width (X)of the height date
 * @param {type} height      the height(Y) of the height data
 * @param {type} corners     indexes of the corners (for the back)
 * @returns {faces}
 */
    processFaces: function(width, height,corners) {
        var i, j;
        var index = 0;
        var heightPixels = height;
        var widthPixels = width;
        height--;
        width--;
        var a, b, c, d;
        var yoffset = 0;
        var y1offset = widthPixels;
        
        var faces=[];
        faces.length = (height * width * 2)+(this.centreBack?2:0);
        
        for (i = 0; i < height; i++) {
            var xoffset = 0;
            var x1offset = 1;
            for (j = 0; j < width; j++) {
                // select 4 vertice indexes
                    a = yoffset + xoffset;
                    b = yoffset + x1offset;
                    c = y1offset + x1offset;
                    d = y1offset + xoffset;
                // add faces
                 // special case for bottom left and top right corners
                 // where the triangle's hypotenuse cuts across the corner
                 // rotate the face 90 degrees so that the output
                 // has nice sharp corners
                if (((j===0)&&(i===0))||((j===width-1)&&(i===height-1))) {
                    faces[index++] = new THREE.Face3(a, b, c);
                    faces[index++] = new THREE.Face3(c, d, a);
                } else {
                    faces[index++] = new THREE.Face3(a, b, d);
                    faces[index++] = new THREE.Face3(b, c, d);
                }
                
                if (this.centreBack) {
                    // add extra faces for the back of the lithophane
                    if (j===0) {
                        faces[index++] = new THREE.Face3(a,d,heightPixels* widthPixels);
                    } else if (j===width-1) {
                        faces[index++] = new THREE.Face3(c,b,heightPixels* widthPixels);
                    } 
                    if (i===0) {
                        faces[index++] = new THREE.Face3(b,a,heightPixels* widthPixels);
                    } else if (i===height-1) {
                        faces[index++] = new THREE.Face3(d,c,heightPixels* widthPixels);
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
 * @returns {UVs}
 */
    processUVs: function(width, height) {
        var i, j;
        var index = 0;
        var heightPixels = height;
        var widthPixels = width;
        //var verts=geometry.vertices;
        height--;
        width--;
        var uva, uvb, uvc, uvd;
        index = 0;
        var uvs=[];
        uvs.length = (height+(this.centreBack?1:0)) * (width+(this.centreBack?1:0)) * 2;
        for (i = 0; i < height; i++) {
            // UV Array holds values from 0-1
            var yProp = i / height;
            var y1Prop = (i + 1) / height;
            for (j = 0; j < width; j++) {
                // UV Array holds values from 0-1
                var xProp = j / width;
                var x1Prop = (j + 1) / width;
                uva = new THREE.Vector2(xProp , yProp );
                uvb = new THREE.Vector2(x1Prop, yProp );
                uvc = new THREE.Vector2(x1Prop, y1Prop);
                uvd = new THREE.Vector2(xProp , y1Prop);
                
                 // special case for bottom left and top right corners
                 // where the triangle's hypotenuse cuts across the corner
                 // rotate the face 90 degrees so that the output
                 // has nice sharp corners
                if (((j===0)&&(i===0))||((j===width-1)&&(i===height-1))) {
                    uvs[index++] = [uva, uvb, uvc];
                    uvs[index++] = [uvc.clone(), uvd, uva.clone()];
                } else {
                    uvs[index++] = [uva, uvb, uvd];
                    uvs[index++] = [uvb.clone(), uvc, uvd.clone()];
                }
                if (this.centreBack) {
                    // add extra UVs for the back of the lithophane
                    if (j===0) {
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
                    }
                }
            }
        }
        // add extra four UVs for the back of the lithophane
        //uva = new THREE.Vector2(0, 0);
        //uvb = new THREE.Vector2(0, 1);
        //uvc = new THREE.Vector2(1, 1);
        //uvd = new THREE.Vector2(1, 0);
        //uvs[index++] = [uva, uvb, uvd];
        //uvs[index++] = [uvb.clone(), uvc, uvd.clone()];
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
 * @returns {undefined}
 */
    addBaseSizePos: function(toGeometry, WidthInMM, HeightInMM, ThickInMM ,borderThicknessInMM, baseDepth,vertexPixelRatio) {
        // adjust to exact size required - there is always 1 pixel less on the 
        // width & height due to the vertices being positioned in the middle of each pixel
        toGeometry.computeBoundingBox();
        var gWidth =(toGeometry.boundingBox.max.x - toGeometry.boundingBox.min.x);
        var gHeight=(toGeometry.boundingBox.max.y - toGeometry.boundingBox.min.y);
        var gThick =(toGeometry.boundingBox.max.z - toGeometry.boundingBox.min.z);
        toGeometry.center();
        // Place on floor
        toGeometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, 0-toGeometry.boundingBox.min.z));
        
        var back=new THREE.PlaneGeometry(gWidth,gHeight,gWidth,gHeight);
        //back.applyMatrix(new THREE.Matrix4().makeTranslation(toGeometry.boundingBox.min.x,toGeometry.boundingBox.min.y,toGeometry.boundingBox.min.z));
        back.applyMatrix(new THREE.Matrix4().makeRotationX(Math.PI));
        toGeometry.merge(back);
        toGeometry.mergeVertices();
        
        gWidth /=vertexPixelRatio;
        gHeight/=vertexPixelRatio;
        gThick /=vertexPixelRatio;

        toGeometry.applyMatrix(new THREE.Matrix4().makeScale(WidthInMM/gWidth,HeightInMM/gHeight,ThickInMM/gThick));

        // centre mesh
        toGeometry.center();
        // Place on floor
        toGeometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, ThickInMM*vertexPixelRatio / 2));
        // add a base
        if (baseDepth !== 0) {
            var baseThickness=borderThicknessInMM;
            // if there is no border, add a 2mm thick base
            if (baseThickness===0) {
                var baseThickness=2;
                // if the base sticks out the front, move the litho up above it
                if (baseDepth>0) {
                    toGeometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, baseThickness*vertexPixelRatio, 0));
                }
            }
            // cube for base
            var lithoBase = new THREE.BoxGeometry(WidthInMM*vertexPixelRatio, 
                                                   baseThickness * vertexPixelRatio, 
                                                   Math.abs(baseDepth) * vertexPixelRatio);
            // move bas to position
            lithoBase.applyMatrix(new THREE.Matrix4().makeTranslation(0, 0 - (HeightInMM-baseThickness)*vertexPixelRatio / 2, (baseDepth * vertexPixelRatio) / 2));
            toGeometry.merge(lithoBase);
            
            // rotate for vertical printing if there's a base
            toGeometry.applyMatrix(new THREE.Matrix4().makeRotationX(Math.PI / 2));
            toGeometry.center();
            toGeometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, HeightInMM*vertexPixelRatio / 2));
        }
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
 *  public  generateSTL      Create a String containing an ASCII STL blob
 * @param {type} geometry    The geometry to process
 * @param {type} name        The output file name (included in the ST file)
 * @param {type} scale       The scale Vertex to MM for output in MM
 * @returns {String}
 */
    generateSTL: function(geometry, name,scale) {
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
 *  public  saveTxtSTL       Call SaveAs with an ASCII STL Blob
 * @param {type} stlString   the string contaning the STL data
 * @param {type} name        The output file name 
 * @returns {undefined}
 */
    saveTxtSTL: function(stlString, name) {
        var blob = new Blob([stlString], { type: 'text/plain;charset=utf-8' });
        saveAs(blob, name + '.stl');
    },
/*******************************************************************************
 * 
 *  public  saveBinSTL       Call SaveAs with an Binary STL Blob
 * @param {type} dataview    the binary blob contaning the STL data
 * @param {type} name        The output file name 
 * @returns {undefined}
 */
    saveBinSTL: function(dataview, name) {
        var blob = new Blob([dataview], { type: 'application/octet-binary' });
        saveAs(blob, name + '.stl');
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
            offset = writeVector(dv, offset, tris[n].normal, isLittleEndian);
            offset = writeVector(dv, offset, verts[tris[n].a], isLittleEndian);
            offset = writeVector(dv, offset, verts[tris[n].b], isLittleEndian);
            offset = writeVector(dv, offset, verts[tris[n].c], isLittleEndian);
            offset += 2; // unused 'attribute byte count' is a Uint16
        }
        return dv;
    }
};
