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
    public  initPage        Main Initialisation method - entry point
    private getValue        Worker for updateValues gets individual params
    public  updateValues    Take values from UI and apply range checking
    private setupDragNDrop  Setup panel for drag and drop operations
    private setProgress     Update the progress bar and status indicator
    private previewFile     Load the preview image into the drop panel           
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
    public  createHeightMesh Go through each of the processing steps updating 
                             the progress bar and allowing the UI to refresh
    private addBackBox       Add base , centre and set exact size
}
Class STLGenerator {
    public  generateSTL      Create a String containing an ASCII STL blob
    public  createBinSTL     Create a Binary STL blob
    public  saveTxtSTL       Call SaveAs with an ASCII STL Blob
    public  saveBinSTL       Call SaveAs with an Binary STL Blob
}

Additional disclaimer - for the code style gurus:
_______________________________________________________________________________
Although I'm not new to programming, this is my first venture into HTML5 & 
JavaScript or should I say ECMAScript5, there appears to be 300 ways of 
declaring an object I've tried to follow the style set in Three.js, although I 
couldn't follow it exactly.  I'm looking forward to the Types & Classes in 
ECMA Script 6, when that comes, I'll probably revisit this code and make it more 
maintainable with less JavaScript 5 percularities :(
*****************************************************************************/

var LITHO = { REVISION: '6' };
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
    this.imageMap = new LITHO.ImageMap(this);
    this.scene3d = new LITHO.Scene3D(this);
    this.lithoBox = new LITHO.LithoBox(this);
    this.stlGenerator = new LITHO.STLGenerator(this);
    this.droptarget = document.getElementById('droptarget');
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
    imageFileName : "testLithophane", // overwritten by the original image name
    currentImage : undefined,
    updatingScene : false, // used to stop render code during a change of scene
    
    // some defalt values - these are overridden by the ones in the HTML file
    // by an initial call to UpdateValues SO modify them in the HTML, not here!
    maxOutputDimensionInMM : 100,
    actualThicknessInMM : 6,
    borderThicknessInMM : 3,
    minThicknessInMM : 0.3,
    vertexPixelRatio : 2,
    baseDepth : 0,
    reFlip : false, 
    
    // values calculated from parameters for ease of reading
    borderPixels : this.vertexPixelRatio * this.borderThicknessInMM,
    maxOutputWidth : this.maxOutputDimensionInMM - this.borderThicknessInMM * 2,
    maxOutputDepth : this.maxOutputDimensionInMM - this.borderThicknessInMM * 2,
    maxOutputHeight : this.actualThicknessInMM - this.minThicknessInMM,
    HeightInMM:this.maxOutputDimensionInMM,
    WidthInMM:this.maxOutputDimensionInMM,
    ThickInMM:this.actualThicknessInMM,
    zScale : this.maxOutputHeight / 255,
    
    lithoGeometry : undefined,
    height_data : undefined,
    image_width : 0,
    image_height : 0,
    
/*******************************************************************************
 * 
 *  public  initPage        Main Initialisation method - entry point
 * @returns {undefined}
 */    
    initPage:function () {
        this.setupDragNDrop();
        this.updateValues(undefined);
        this.scene3d.init3D(true);
    },
    
/*******************************************************************************
 * 
 *  private getValue        Worker for updateValues gets individual params
 * @param {type} fieldName
 * @param {type} defaultVal
 * @param {type} minVal
 * @param {type} maxVal
 * @returns {LITHO.Lithophane.prototype.getValue.value}
 */
    getValue:function (fieldName, defaultVal, minVal, maxVal) {
        var element = document.getElementById(fieldName);
        var value = parseFloat(element.value);
        if ((value >= minVal) && (value <= maxVal)) {
            element.className = '';
            return value;
        }
        element.className = 'outRange'; // mark if out of range
        return defaultVal; // and use the passed default value instead
    },
/*******************************************************************************
 * 
 *  public  updateValues    Take values from UI and apply range checking
 * @param Event event - click event - unused
 * @returns {undefined}
 */
    updateValues:function (event) {
        this.maxOutputDimensionInMM = this.getValue('miximumSize', this.maxOutputDimensionInMM, 1, 1000);
        this.actualThicknessInMM = this.getValue('thickness', this.actualThicknessInMM, 1, 100);
        this.borderThicknessInMM = this.getValue('borderThick', this.borderThicknessInMM, 0, this.maxOutputDimensionInMM / 2);
        this.minThicknessInMM = this.getValue('minLayer', this.minThicknessInMM, 0.1, this.actualThicknessInMM);
        this.vertexPixelRatio = this.getValue('vectorsPerPixel', this.vertexPixelRatio, 1, 5);
        this.baseDepth = this.getValue('baseDepth', this.baseDepth, -50, 50);
        this.reFlip = document.getElementById('reFlip').checked;
        
        // recalculate basic measurements
        this.borderPixels = this.vertexPixelRatio * this.borderThicknessInMM;
        this.maxOutputWidth = this.maxOutputDimensionInMM - this.borderThicknessInMM * 2;
        this.maxOutputDepth = this.maxOutputDimensionInMM - this.borderThicknessInMM * 2;
        this.maxOutputHeight = this.actualThicknessInMM - this.minThicknessInMM;
        this.zScale = this.maxOutputHeight / 255;
        this.ThickInMM=this.actualThicknessInMM;
    },
/*******************************************************************************
 * 
 *  private setupDragNDrop  Setup panel for drag and drop operations
 * @returns {undefined}
 */    
    setupDragNDrop:function () {
        if (this.supported.draganddrop) {
            this.droptarget.parentObject=this; // needed for callbacks
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
                    this.parentObject.previewFile(files[i]);
                }
            };
        }
    },
/*******************************************************************************
 * 
 *  private setProgress     Update the progress bar and status indicator
 * @param Number level - 0-100
 * @param String state - "loading..." see createHeightMesh() for examples
 * @returns {undefined}
 */
    setProgress:function (level, state) {
        var progressBar = document.getElementById('progressBar');
        var progressState = document.getElementById('progressState');
        progressBar.style.visibility = level === 0 ? "hidden" : "visible";
        progressBar.value = level;
        progressState.innerHTML = state;
    },
/*******************************************************************************
 * 
 * private previewFile     Load the preview image into the drop panel           
 * @param {type} file - image file to load and show the image in the preview
 * @returns {undefined}]
 */
    previewFile:function (file) {
        var reader = new FileReader();
        reader.parentObject=this; // needed for callbacks
        function onImageClicked(event) {
            reader.parentObject.currentImage = event.target; // the image that was clicked
            reader.parentObject.lithoBox.createHeightMesh();
        };
        if (this.supported.filereader === true && this.acceptedTypes[file.type] === true) {
            reader.onprogress = function (event) {
                var level = (event.loaded / event.total * 100);
                console.log('progress ' + level.toFixed(1) + '%');
                this.parentObject.setProgress(level, 'loading...');
            };
            reader.onload = function (event) {
                var image = new Image();
                image.src = event.target.result;
                image.onclick = onImageClicked;
                image.filename = file.name;
                if (image.naturalWidth > image.naturalHeight) {
                    image.width = 250;
                }
                else {
                    image.height = 250;
                }
                this.parentObject.droptarget.appendChild(image);
                // show alternative message once first file has been dropped
                document.getElementById('droptargetaltbg').style.visibility="visible";
                document.getElementById('droptargetbg').style.visibility="hidden";
                this.parentObject.setProgress(0, '');
            };
            reader.readAsDataURL(file);
        }
    }
};

/*******************************************************************************
 * 
 * Class Scene3D 
 * 
 */
LITHO.Scene3D = function (parent) {
    this.parentLitho=parent;
};
LITHO.Scene3D.prototype = {
    
    constructor: LITHO.Scene3D,
    
    renderer : undefined,
    scene : undefined,
    camera : undefined,
    controls : undefined,

/*******************************************************************************
 * 
 *  public  init3D          Setup the 3D scene (called for each new model)
 * @param Boolean createBox - create a dummy lithophane for empty startup scene
 * @returns {undefined}
 */    
    init3D : function (createBox) {
        var thisobject=this; // needed for call back functions
        function render() {
            thisobject.controls.update();
            requestAnimationFrame(render);
            if (!thisobject.parentLitho.updatingScene)
                thisobject.renderer.render(thisobject.scene, thisobject.camera);
        };
        function Resize(e) {
            var width = parseInt(window.getComputedStyle(thisobject.container).width);
            var height = parseInt(window.getComputedStyle(thisobject.container).height);
            thisobject.camera.aspect = width / height;
            thisobject.camera.updateProjectionMatrix();
            thisobject.renderer.setSize(width, height);
        };
        
        // should get the Canvas Renderer working for other browsers...
        //if ((Detector!==undefined) && (! Detector.webgl) ) Detector.addGetWebGLMessage();
        
        this.container = document.getElementById('threedcanvas');
        var width = parseInt(window.getComputedStyle(this.container).width);
        var height = parseInt(window.getComputedStyle(this.container).height);
        this.container.innerHTML = "";
        var aspect = width / height;
        
        this.camera = new THREE.PerspectiveCamera(37.5, aspect, 1, 5000);
        this.controls = new THREE.NormalControls(this.camera, this.container);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: false });
        this.renderer.setClearColor(0xFFFFFF);
        this.renderer.setSize(width, height);
        this.renderer.autoClear = true;
        this.container.appendChild(this.renderer.domElement);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        if (createBox) {
            this.parentLitho.lithoGeometry = new THREE.BoxGeometry(this.parentLitho.maxOutputDimensionInMM * this.parentLitho.vertexPixelRatio, this.parentLitho.maxOutputDimensionInMM * this.parentLitho.vertexPixelRatio, this.parentLitho.maxOutputHeight);
        }
        else {
            this.parentLitho.lithoGeometry = new THREE.Geometry();
        }
        this.parentLitho.lithoGeometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, 5));
        this.setUp3DScene(this.parentLitho.lithoGeometry, this.parentLitho.maxOutputDimensionInMM * this.parentLitho.vertexPixelRatio, this.parentLitho.maxOutputDimensionInMM * this.parentLitho.vertexPixelRatio);
        render();
        window.addEventListener('resize', Resize, false);
    },
/*******************************************************************************
 * 
 *  public  setUp3DScene    Add the model and ground plane into the scene
 * @param {Geometry} lithoMesh - the geometry to add to the scene
 * @param {Number} width - of the lithophane - just used to set camera position
 * @param {Number} height - of the lithophane - unused
 * @returns {undefined}
 */    
    setUp3DScene: function(lithoMesh, width, height) {
        this.parentLitho.updatingScene = true;
        try {
            this.scene = new THREE.Scene();
            
            var showFloor=true;
            if (showFloor) {
                var baseWidth = 900;
                var divisions = Math.floor(baseWidth / (this.parentLitho.vertexPixelRatio * 10)); // 10mm grid
                var groundMaterial = new THREE.MeshPhongMaterial({ color: 0x808080, wireframe: true, shininess: 0 });
                var groundPlane = new THREE.PlaneGeometry(baseWidth, baseWidth, divisions, divisions);
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
            
            var addBackLight=false;
            if (addBackLight) {
                var spotLight = new THREE.SpotLight(0xffffff, 1, 0);
                spotLight.position.set(-1000, 1000, -1000);
                spotLight.castShadow = false;
                this.scene.add(spotLight);
                var pointLight = new THREE.PointLight(0xffffff, 1, 0);
                pointLight.position.set(3000, -4000, -3500);
                this.scene.add(pointLight);
            }
            
            var material = new THREE.MeshPhongMaterial({ color: 0x001040, specular: 0x006080, side: THREE.DoubleSide,shininess: 10 });
            var lithoPart = new THREE.Mesh(lithoMesh, material);
            this.scene.add(lithoPart);
            
            var showOverMesh = false;
            if (showOverMesh) {
                var meshmaterial = new THREE.MeshPhongMaterial({ color: 0xFFFFFF, specular: 0x006080, shininess: 10, side: THREE.DoubleSide, wireframe: true });
                var lithoMeshPart = new THREE.Mesh(lithoPart.geometry, meshmaterial);
                this.scene.add(lithoMeshPart);
            }
            
            if (this.parentLitho.baseDepth !== 0) {
                this.camera.position.x = 0;
                this.camera.position.y = 0 - width * 1.5;
                this.camera.position.z = width * 1;
            }
            else {
                this.camera.position.x = 0;
                this.camera.position.y = 0;
                this.camera.position.z = width * 1.6;
            }
        }
        catch (e) {
            console.log(e.message);
        }
        this.parentLitho.updatingScene = false;
    }
};

/*******************************************************************************
 * 
 * Class ImageMap 
 * 
 */
LITHO.ImageMap = function (parent) {
    this.parentLitho=parent;
    this.xyScale=1;
};
LITHO.ImageMap.prototype = {
    
    constructor: LITHO.ImageMap,
    
/*******************************************************************************
 * 
 *  public  processImage    Do the 2D processing of the clicked image
 * @returns {undefined}
 */    
    processImage: function() {
        var image = this.parentLitho.currentImage;
        if (image.filename !== undefined) {
            this.parentLitho.imageFileName = image.filename;
        }
        else {
            this.parentLitho.imageFileName = "testLithophane";
        }
        
        //create a canvas to hold our image data while we process it
        var canvas = document.getElementById("outputcanvas");
        
        // make our canvas the same size as the image
        if (image.naturalWidth > image.naturalHeight) {
            this.xyScale = (this.parentLitho.maxOutputWidth / image.naturalWidth) * this.parentLitho.vertexPixelRatio;
            this.parentLitho.WidthInMM=this.parentLitho.maxOutputDimensionInMM;
            this.parentLitho.HeightInMM=this.parentLitho.maxOutputDimensionInMM/(image.naturalWidth/image.naturalHeight);
        }
        else {
            this.xyScale = (this.parentLitho.maxOutputDepth / image.naturalHeight) * this.parentLitho.vertexPixelRatio;
            this.parentLitho.HeightInMM=this.parentLitho.maxOutputDimensionInMM;
            this.parentLitho.WidthInMM=this.parentLitho.maxOutputDimensionInMM*(image.naturalWidth/image.naturalHeight);
        }
        
        var edgeThickness=this.parentLitho.borderPixels;
        if (edgeThickness===0) edgeThickness=1;
        
        canvas.width  = (image.naturalWidth  * this.xyScale) + (2 * edgeThickness);
        canvas.height = (image.naturalHeight * this.xyScale) + (2 * edgeThickness);
        
        // we'll need the 2D context to manipulate the data
        var canvas_context = canvas.getContext("2d");
        canvas_context.beginPath();
        canvas_context.lineWidth = "1";
        canvas_context.fillStyle = "black";
        canvas_context.rect(0, 0, canvas.width, canvas.height);
        canvas_context.fill();
        canvas_context.drawImage(image, edgeThickness, edgeThickness, canvas.width - 2 * edgeThickness, canvas.height - 2 * edgeThickness); // draw the image on our canvas
        
        // image_data points to the image metadata including each pixel value
        var image_data = canvas_context.getImageData(0, 0, canvas.width, canvas.height);
        
        // pixels points to the canvas pixel array, arranged in 4 byte blocks of Red, Green, Blue and Alpha channel
        var pixels = image_data.data;
        var numb_pixels = pixels.length / 4; // the number of pixels to process
        
        this.parentLitho.height_data = new Uint8Array(numb_pixels); // an array to hold the result data
        
        var image_pixel_offset = 0; // current image pixel being processed
        for (var height_pixel_index = 0; height_pixel_index < numb_pixels; height_pixel_index++) {
            // extract red,green and blue from pixel array
            var red_channel = pixels[image_pixel_offset], green_channel = pixels[image_pixel_offset + 1], blue_channel = pixels[image_pixel_offset + 2];
            // create negative monochrome value from red, green and blue values
            var negative_average = 255 - (red_channel * 0.299 + green_channel * 0.587 + blue_channel * 0.114);
            
            this.parentLitho.height_data[height_pixel_index] = negative_average; // store calue in height array

            // store value back in canvas in all channels for 2D display of negative monochrome image
            pixels[image_pixel_offset] = pixels[image_pixel_offset + 1] = pixels[image_pixel_offset + 2] = negative_average;
            image_pixel_offset += 4; // offest of next pixel in RGBA byte array
        }
        // display modified image
        canvas_context.putImageData(image_data, 0, 0, 0, 0, image_data.width, image_data.height);
        // create 3D lithophane using height data
        this.parentLitho.image_width = image_data.width;
        this.parentLitho.image_height = image_data.height;
    }
};

/*******************************************************************************
 * 
 * Class LithoBox 
 * 
 */
LITHO.LithoBox = function (parent) {
    this.parentLitho=parent;
};
LITHO.LithoBox.prototype = {
    
    constructor: LITHO.LithoBox,
    
/*******************************************************************************
 * 
 *  private processVectors   Create vectors of 2D points from height map
 * @param {type} verts       Geometry.vertices array to process
 * @param {type} heightData  The height data extracted from the image
 * @param {type} width       The width (X)of the height date
 * @param {type} height      the height(Y) of the height data
 * @returns {undefined}
 */
    processVectors: function (verts, heightData, width, height) {
        var i, j;
        var index = 0;
        var heightPixels = height;
        var widthPixels = width;
        height--;
        width--;
        verts.length = height * width;
        for (i = 0; i <= height; i++) {
            for (j = 0; j <= width; j++) {
                var x=this.parentLitho.reFlip ? j : widthPixels - j;
                var y=heightPixels - i;
                // square up edges
                if (x===2) x--;
                if (y===2) y--;
                if (x===width) x++;
                if (y===height) y++;
                
                if ((i===0)||(j===0)||(i===height)||j===width) { // make sure the edge pixels go down to the base
                    verts[index] = new THREE.Vector3(x, y, 0);
                } else {
                    verts[index] = new THREE.Vector3(x, y, 
                    (this.parentLitho.minThicknessInMM + (heightData[index] * this.parentLitho.zScale)) * this.parentLitho.vertexPixelRatio);
                }
                index++;
            }
        }
        // add extra four vertices for the back of the lithophane
        verts[index++]=new THREE.Vector3(1          ,1           ,0);
        verts[index++]=new THREE.Vector3(1          ,heightPixels,0);
        verts[index++]=new THREE.Vector3(widthPixels,heightPixels,0);
        verts[index++]=new THREE.Vector3(widthPixels,1           ,0);
    },
/*******************************************************************************
 * 
 *  private processFaces     Create Face Trangles 
 * @param {type} faces       the geometry faces aray to process
 * @param {type} width       The width (X)of the height date
 * @param {type} height      the height(Y) of the height data
 * @returns {undefined}
 */
    processFaces: function(faces, width, height) {
        var i, j;
        var index = 0;
        var heightPixels = height;
        var widthPixels = width;
        //var verts=geometry.vertices;
        height--;
        width--;
        var a, b, c, d;
        var yoffset = 0;
        var y1offset = widthPixels;
        index = 0;
        faces.length = height * width * 2;
        for (i = 0; i < height; i++) {
            var xoffset = 0;
            var x1offset = 1;
            for (j = 0; j < width; j++) {
                // select 4 vertice indexes
                    a = yoffset + xoffset;
                    b = yoffset + x1offset;
                    c = y1offset + x1offset;
                    d = y1offset + xoffset;
                // add faces and uvs
                
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
                xoffset++;
                x1offset++;
            }
            yoffset += widthPixels;
            y1offset += widthPixels;
        }
        // add extra two faces for the back of the lithophane
        a = heightPixels*widthPixels;
        b = a+1;
        c = b+1;
        d = c+1;
        faces[index++] = new THREE.Face3(a, b, d);
        faces[index] = new THREE.Face3(b, c, d);
    },
/*******************************************************************************
 * 
 *  private processUVs       Create UV mapping for material visualisation
 * @param {type} uvs         The geomenter UVs array to process
 * @param {type} width       The width (X)of the height date
 * @param {type} height      the height(Y) of the height data
 * @returns {undefined}
 */
    processUVs: function(uvs, width, height) {
        var i, j;
        var index = 0;
        var heightPixels = height;
        var widthPixels = width;
        //var verts=geometry.vertices;
        height--;
        width--;
        var uva, uvb, uvc, uvd;
        index = 0;
        uvs.length = height * width * 2;
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
                if (((j===0)&&(i===0))||((j===width-1)&&(i===height-1))) {
                    uvs[index++] = [uva, uvb, uvc];
                    uvs[index++] = [uvc.clone(), uvd, uva.clone()];
                } else {
                    uvs[index++] = [uva, uvb, uvd];
                    uvs[index++] = [uvb.clone(), uvc, uvd.clone()];
                }
            }
        }
        // add extra four UVs for the back of the lithophane
        uva = new THREE.Vector2(0, 0);
        uvb = new THREE.Vector2(0, 1);
        uvc = new THREE.Vector2(1, 1);
        uvd = new THREE.Vector2(1, 0);
        uvs[index++] = [uva, uvb, uvd];
        uvs[index++] = [uvb.clone(), uvc, uvd.clone()];
    },
/*******************************************************************************
 * 
 *  public  createHeightMesh Go through each of the processing steps updating 
 *                           the progress bar and allowing the UI to refresh
 * @returns {undefined}
 */
    createHeightMesh: function() {
        var geometry = new THREE.Geometry();
        var verts = geometry.vertices;
        var uvs = geometry.faceVertexUvs[0];
        var faces = geometry.faces;
        var stlString;
        var stlBin;
        var parent=this;
        var parentLitho=parent.parentLitho;
        
        // each of the "DoChunkN()" functions splits up the processing so that the progress bar can update
        // an approximate position and status is set in each function before a setTimeout call to the next
        // allowing the UI to update before proceeding
        // ugly, but hey, what's a person to do...
        
        parentLitho.scene3d.init3D(false);
        parentLitho.setProgress(10, '2D processing...');
        setTimeout(doChunk0, 1);
        function doChunk0() {
            parentLitho.imageMap.processImage();
            parentLitho.setProgress(20, 'Processing Vectors...');
            setTimeout(doChunk1, 1);
        }
        function doChunk1() {
            parent.processVectors(verts, parentLitho.height_data, parentLitho.image_width, parentLitho.image_height);
            parent.parentLitho.setProgress(30, 'Processing Faces...');
            setTimeout(doChunk2, 1);
        }
        function doChunk2() {
            parent.processFaces(faces, parentLitho.image_width, parentLitho.image_height);
            parent.parentLitho.setProgress(50, 'Processing Surface...');
            setTimeout(doChunk3, 1);
        }
        function doChunk3() {
            parent.processUVs(uvs, parentLitho.image_width, parentLitho.image_height);
            geometry.computeFaceNormals();
            geometry.computeVertexNormals();
            parentLitho.lithoGeometry = geometry;
            parentLitho.setProgress(75, 'Adding to scene...');
            setTimeout(doChunk4, 1);
        }
        function doChunk4() {
            parent.addBackBox(parentLitho.lithoGeometry, parentLitho.image_width, parentLitho.image_height);
            parentLitho.scene3d.setUp3DScene(parentLitho.lithoGeometry, parentLitho.image_width, parentLitho.image_height);
            parentLitho.setProgress(80, 'Creating STL file...');
            setTimeout(doChunk5, 1);
        }
        function doChunk5() {
            stlBin = parentLitho.stlGenerator.createBinSTL(parentLitho.lithoGeometry,1/parentLitho.vertexPixelRatio);
            parentLitho.setProgress(95, 'Downloading...');
            setTimeout(doChunk6, 1);
        }
        function doChunk6() {
            parentLitho.stlGenerator.saveBinSTL(stlBin, parentLitho.imageFileName);
            parentLitho.setProgress(0, '');
        }
    },
/*******************************************************************************
 * 
 *  private addBackBox       Add base , centre and set exact size
 * @param {type} toGeometry  The geomentry to modify
 * @param {type} width       The width (X) of the height data
 * @param {type} height      the height(Y) of the height data
 * @returns {undefined}
 */
    addBackBox: function(toGeometry, width, height) {
        var pixelWidth = width - 1;
        var pixelHeight = height - 1;

        // centre mesh
        toGeometry.applyMatrix(new THREE.Matrix4().makeTranslation(0-(width + 1) / 2, 0 - (height + 1) / 2, 0));

        // adjust to exact size required - there is always 1 pixel less on the 
        // width /height due to the vertices being positioned in the middle of each pixel
        toGeometry.computeBoundingBox();
        var gWidth =(toGeometry.boundingBox.max.x - toGeometry.boundingBox.min.x)/this.parentLitho.vertexPixelRatio;
        var gHeight=(toGeometry.boundingBox.max.y - toGeometry.boundingBox.min.y)/this.parentLitho.vertexPixelRatio;
        var gThick =(toGeometry.boundingBox.max.z - toGeometry.boundingBox.min.z)/this.parentLitho.vertexPixelRatio;
        toGeometry.applyMatrix(new THREE.Matrix4().makeScale(this.parentLitho.WidthInMM/gWidth,this.parentLitho.HeightInMM/gHeight,this.parentLitho.ThickInMM/gThick));
        
        // add a base
        if (this.parentLitho.baseDepth !== 0) {
            var baseThickness=this.parentLitho.borderThicknessInMM;
            // if there is no border, add a 2mm thick base
            if (baseThickness===0) {
                var baseThickness=2;
                // if the base sticks out the front, move the litho up above it
                if (this.parentLitho.baseDepth>0) {
                    toGeometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, baseThickness*this.parentLitho.vertexPixelRatio, 0));
                }
            }
            // cube for base
            var lithoBase = new THREE.BoxGeometry(this.parentLitho.WidthInMM*this.parentLitho.vertexPixelRatio, 
                                                   baseThickness * this.parentLitho.vertexPixelRatio, 
                                                   Math.abs(this.parentLitho.baseDepth) * this.parentLitho.vertexPixelRatio);
            // move bas to position
            lithoBase.applyMatrix(new THREE.Matrix4().makeTranslation(0, 0 - (this.parentLitho.HeightInMM-baseThickness)*this.parentLitho.vertexPixelRatio / 2, (this.parentLitho.baseDepth * this.parentLitho.vertexPixelRatio) / 2));
            toGeometry.merge(lithoBase);
        }
        // rotate for vertical printing if there's a base
        if (this.parentLitho.baseDepth !== 0) {
            toGeometry.applyMatrix(new THREE.Matrix4().makeRotationX(Math.PI / 2));
            toGeometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, pixelHeight / 2));
        }
    }
};

/*******************************************************************************
 * 
 * Class STLGenerator
 * 
 */
LITHO.STLGenerator = function (parent) {
    this.parentLitho=parent;
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
