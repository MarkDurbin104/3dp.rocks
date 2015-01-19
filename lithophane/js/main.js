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
*****************************************************************************/
var supported = {
	draganddrop : false,
	filereader : false
};
var droptarget;
var acceptedTypes = {
	'image/png' : true,
	'image/jpeg' : true,
	'image/gif' : true,
	'image/bmp' : true
};

supported.draganddrop = 'draggable' in document.createElement('span');
var imageFileName="testLithophane";
var currentImage;

var scene;
var camera;
var controls;
var renderer;
var updatingScene=false;

var maxOutputDimensionInMM=100;
var actualThicknessInMM=6;
var borderThicknessInMM=3;
var minThicknessInMM=0.3;
var vertexPixelRatio=2;
var baseDepth=0;

var borderPixels=vertexPixelRatio*borderThicknessInMM;
var maxOutputWidth=maxOutputDimensionInMM-borderThicknessInMM*2;
var maxOutputDepth=maxOutputDimensionInMM-borderThicknessInMM*2;
var maxOutputHeight=actualThicknessInMM-minThicknessInMM;
var zScale=maxOutputHeight/255;
var lithoGeometry;
var height_data;
var image_width=0;
var image_height=0;

function initPage() {
    setupDragNDrop();
    init3D(true);
    updateValues();
}
function getValue(fieldName,defaultVal,minVal,maxVal) {
    var element=document.getElementById(fieldName);
    var value=parseFloat(element.value);
    if ((value>=minVal)&&(value<=maxVal)) {
        element.className = '';
        return value;
    } 
    element.className = 'outRange';
    return defaultVal;
}
function updateValues(event) {
    maxOutputDimensionInMM=getValue('miximumSize',maxOutputDimensionInMM,1,1000);
    actualThicknessInMM=getValue('thickness',actualThicknessInMM,1,100);
    borderThicknessInMM=getValue('borderThick',borderThicknessInMM,0.4,maxOutputDimensionInMM/2);
    minThicknessInMM=getValue('minLayer',minThicknessInMM,0.1,actualThicknessInMM);
    vertexPixelRatio=getValue('vectorsPerPixel',vertexPixelRatio,1,5);
    baseDepth=getValue('baseDepth',baseDepth,0,50);
    
    borderPixels=vertexPixelRatio*borderThicknessInMM;
    maxOutputWidth=maxOutputDimensionInMM-borderThicknessInMM*2; 
    maxOutputDepth=maxOutputDimensionInMM-borderThicknessInMM*2;   
    maxOutputHeight=actualThicknessInMM-minThicknessInMM; 
    zScale=maxOutputHeight/255;
} 
function render() { 
    controls.update();
    requestAnimationFrame( render );
    if (!updatingScene) renderer.render( scene, camera );
}
function init3D(createBox) {
    //if ((Detector!==undefined) && (! Detector.webgl) ) Detector.addGetWebGLMessage();
    
    var container = document.getElementById('threedcanvas');
    var width=parseInt(window.getComputedStyle(container).width);
    var height=parseInt(window.getComputedStyle(container).height);
    container.innerHTML="";
    
    var aspect = width / height;
    var radius = 5;
    
    
    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setClearColor( 0xFFFFFF );
    renderer.setSize( width, height );
    renderer.autoClear = true;
    container.appendChild( renderer.domElement );

    window.addEventListener( 'resize',onResize, false );
    
    camera = new THREE.PerspectiveCamera( 37.5, aspect, 1, 5000 );
    camera.aspect = width/height;
    camera.updateProjectionMatrix();
    if (createBox) {
        lithoGeometry=new THREE.CubeGeometry(maxOutputDimensionInMM*vertexPixelRatio,maxOutputDimensionInMM*vertexPixelRatio,maxOutputHeight);
    } else {
        lithoGeometry=new THREE.Geometry();
    }
    lithoGeometry.applyMatrix( new THREE.Matrix4().makeTranslation(0,0,5));
    
    setUp3DScene(lithoGeometry,maxOutputDimensionInMM*vertexPixelRatio,maxOutputDimensionInMM*vertexPixelRatio);

    controls = new THREE.NormalControls(camera, container);
    
    render();
    
    function onResize(e) {
        var container = document.getElementById('threedcanvas');
        var width=parseInt(window.getComputedStyle(container).width);
        var height=parseInt(window.getComputedStyle(container).height);
        
        camera.aspect = width/height;
        camera.updateProjectionMatrix();
        
        renderer.setSize( width , height );
    }

}
function setupDragNDrop() {
    supported.draganddrop = 'draggable' in document.createElement('span');
    supported.filereader = typeof FileReader != 'undefined';
    if (supported.draganddrop) {
        droptarget = document.getElementById('droptarget');
        droptarget.ondragover = function() {
            this.className = 'hover';
            return false;
        };
        droptarget.ondragend = function() {
            this.className = '';
            return false;
        };
        droptarget.ondrop = function(e) {
            this.className = '';
            e.preventDefault();
            readFiles(e.dataTransfer.files);
        };
    }
}
function readFiles(files) {
    for (var i = 0; i < files.length; i++) {
        previewFile(files[i]);
    }
}
function setProgress(level,state) {
    var progressBar=document.getElementById('progressBar');
    var progressState=document.getElementById('progressState');
    progressBar.style.visibility = level===0?"hidden":"visible";
    //progressState.style.visibility =  progressBar.style.visibility;
    progressBar.value=level;
    progressState.innerHTML=state;
    //console.log('progress '+level);
}
function previewFile(file) {
    if (supported.filereader === true && acceptedTypes[file.type] === true) {
        var reader = new FileReader();
        reader.onprogress = function(event) {
            var level=(event.loaded / event.total * 100);
            console.log('progress '+level.toFixed(1) + '%');
            setProgress(level,'loading...');
        };
        reader.onload = function(event) {
            var image = new Image();
            image.src = event.target.result;
            image.onclick = onImageClicked;
            image.filename=file.name;
            if (image.naturalWidth > image.naturalHeight) {
                image.width = 250;
            } else {
                image.height = 250;
            }
            droptarget.appendChild(image);
            document.getElementById('droptargetbg').innerHTML='<br><br>click image<br>to convert<br>and download';
            setProgress(0,'');
        };
        reader.readAsDataURL(file);
    }
}
 function processImage() {
    var image=currentImage;
    if (image.filename !== undefined) {
        imageFileName=image.filename;
    } else {
        imageFileName="testLithophane";
    }
    
    //create a canvas to hold our image data while we process it
    var canvas = document.getElementById("outputcanvas");
    // make our canvas the same size as the image
    if (image.naturalWidth>image.naturalHeight) {
        xyScale=(maxOutputWidth/image.naturalWidth)*vertexPixelRatio;
    } else {
        xyScale=(maxOutputDepth/image.naturalHeight)*vertexPixelRatio;
    }
    
    canvas.width  = (image.naturalWidth *xyScale)+(2*borderPixels);
    canvas.height = (image.naturalHeight*xyScale)+(2*borderPixels);
    
    // we'll need the 2D context to manipulate the data
    var canvas_context = canvas.getContext("2d");
    canvas_context.beginPath();
    canvas_context.lineWidth="1";
    canvas_context.fillStyle = "black";
    canvas_context.rect(0,0,canvas.width-1,canvas.height-1);
    canvas_context.fill();
    canvas_context.drawImage(image, borderPixels, borderPixels,canvas.width-2*borderPixels,canvas.height-2*borderPixels); // draw the image on our canvas
    // image_data points to the image metadata including each pixel value
    var image_data = canvas_context.getImageData(0, 0,canvas.width,canvas.height);
    // pixels points to the canvas pixel array, arranged in 4 byte blocks of Red, Green, Blue and Alpha channel
    var pixels = image_data.data; 
    
    var numb_pixels=pixels.length/4; // the number of pixels to process
    
    height_data = new Uint8Array(numb_pixels); // an array to hold the result data
    
    var image_pixel_offset=0;// current image pixel being processed
    // go through each pixel in the image
    for (var height_pixel_index = 0; height_pixel_index < numb_pixels; height_pixel_index++) {
        
        // extract red,green and blue from pixel array
        var red_channel   = pixels[image_pixel_offset    ],
            green_channel = pixels[image_pixel_offset + 1],
            blue_channel  = pixels[image_pixel_offset + 2];
    
        // create negative monochrome value from red, green and blue values
        var negative_average = 255 - (red_channel * 0.299 + green_channel * 0.587 + blue_channel * 0.114);
        
        height_data[height_pixel_index]=negative_average; // store calue in height array
        
        // store value back in canvas in all channels for 2D display of negative monochrome image
        pixels[image_pixel_offset] = pixels[image_pixel_offset + 1] = pixels[image_pixel_offset + 2] = negative_average;
        
        image_pixel_offset+=4; // offest of next pixel in RGBA byte array
    }
    
    // display modified image
    canvas_context.putImageData(image_data, 0, 0, 0, 0, image_data.width, image_data.height);
    
    // create 3D lithophane using height data
    image_width=image_data.width;
    image_height=image_data.height;
}

function onImageClicked(event) {
    var xyScale=1;
    currentImage=event.target; // the image that was clicked
    createHeightMesh();
}

function processVectors(verts, heightData, width, height) {
    var i, j;
    var index=0;
    var heightPixels = height;
    var widthPixels = width;

    height--;
    width--;
    verts.length=height*width;
    for ( i = 0; i <= height; i ++ ) {
        for ( j = 0; j <= width; j ++ ) {
            verts[index]=new THREE.Vector3(widthPixels-j,heightPixels-i, 
                minThicknessInMM+heightData[index]*zScale*vertexPixelRatio);
            index++;
        }
    }
}
function processFaces(faces, width, height) {
    var i, j;
    var index=0;
    var heightPixels = height;
    var widthPixels = width;
    //var verts=geometry.vertices;

    height--;
    width--;
    var a, b, c, d;
    var yoffset=0;
    var y1offset=widthPixels;
    index=0;
    faces.length=height*width*2;
    for ( i = 0; i < height; i ++ ) {
        var xoffset=0;
        var x1offset=1;
        for ( j = 0; j < width; j ++ ) {
            // select 4 vertice indexes
            a = yoffset  + xoffset ;
            b = yoffset  + x1offset;
            c = y1offset + x1offset;
            d = y1offset + xoffset ;
            // add faces and uvs
            faces[index++]=new THREE.Face3( a, b, d );
            faces[index++]=new THREE.Face3( b, c, d );
            xoffset++;
            x1offset++;
        }
        yoffset+=widthPixels;
        y1offset+=widthPixels;
    }
}
function processUVs(uvs, width, height) {
    var i, j;
    var index=0;
    var heightPixels = height;
    var widthPixels = width;
    //var verts=geometry.vertices;

    height--;
    width--;
    var uva, uvb, uvc, uvd;

    index=0;
    uvs.length=height*width*2;
    for ( i = 0; i < height; i ++ ) {
        // UV Array holds values from 0-1
        var yProp = i   /height;
        var y1Prop=(i+1)/height;
        for ( j = 0; j < width; j ++ ) {
            // UV Array holds values from 0-1
            var xProp = j   /width;
            var x1Prop=(j+1)/width;
            uva = new THREE.Vector2( xProp , yProp  );
            uvb = new THREE.Vector2( x1Prop, yProp  );
            uvc = new THREE.Vector2( x1Prop, y1Prop );
            uvd = new THREE.Vector2( xProp , y1Prop );
            
            uvs[index++]=[ uva, uvb, uvd ];
            uvs[index++]=[ uvb.clone(), uvc, uvd.clone() ];
        }
    }
}
function createHeightMesh() {
    var geometry=new THREE.Geometry();
    var verts=geometry.vertices;
    var uvs=geometry.faceVertexUvs[0];
    var faces=geometry.faces;
    var stlString;
    var stlBin;
    
    init3D(false);
    //lithoGeometry=new THREE.Geometry(); // clear memory 
    //setUp3DScene(lithoGeometry,maxOutputDimensionInMM*vertexPixelRatio,maxOutputDimensionInMM*vertexPixelRatio);
    
    setProgress(10,'2D processing...');
    setTimeout(doChunk0, 1);

    function doChunk0() {
        processImage();
        setProgress(20,'Processing Vectors...');
        setTimeout(doChunk1, 1);
    }
    function doChunk1() {
        processVectors(verts, height_data, image_width, image_height);
        setProgress(30,'Processing Faces...');
        setTimeout(doChunk2, 1);
    }
    function doChunk2() {
        processFaces(faces, image_width, image_height);
        setProgress(50,'Processing Surface...');
        setTimeout(doChunk3, 1);
    }
    function doChunk3() {
        processUVs(uvs, image_width, image_height);
        geometry.computeFaceNormals();
        geometry.computeVertexNormals();
        lithoGeometry=geometry;
        setProgress(75,'Adding to scene...');
        setTimeout(doChunk4, 1);
    }
    function doChunk4() {
        addBackBox(lithoGeometry,image_width,image_height);
        setUp3DScene(lithoGeometry,image_width,image_height);
        setProgress(80,'Creating STL file...');
        setTimeout(doChunk5, 1);
    }
    function doChunk5() {
        stlBin=createBinSTL(lithoGeometry);
        //stlString = generateSTL( lithoGeometry,name );
        setProgress(95,'Downloading...');
        setTimeout(doChunk6, 1);
    }
    function doChunk6() {
        saveBinSTL(stlBin,imageFileName);
        //saveTxtSTL(stlString,imageFileName);
        stlString ='';
        setProgress(0,'');
    }
};
function addBackBox(toGeometry,width,height) {
    var pixelWidth=width-1;
    var pixelHeight=height-1;


    // rotate and centre height mesh
    toGeometry.applyMatrix( new THREE.Matrix4().makeRotationY(Math.PI));
    //toGeometry.center();
    toGeometry.applyMatrix( new THREE.Matrix4().makeTranslation((width+1)/2,0-(height+1)/2,(maxOutputHeight*vertexPixelRatio)+minThicknessInMM));
    
    // add back plane and position/rotate normals to face out
    var lithoBack = new THREE.PlaneGeometry( pixelWidth,pixelHeight);
    lithoBack.applyMatrix( new THREE.Matrix4().makeRotationX(0));
    lithoBack.applyMatrix( new THREE.Matrix4().makeTranslation(0,0,(actualThicknessInMM*vertexPixelRatio)));
    toGeometry.merge(lithoBack);
    
    // add side planes and position/rotate normals to face out
    var lithoLeft = new THREE.PlaneGeometry( (actualThicknessInMM*vertexPixelRatio),pixelHeight);
    lithoLeft.applyMatrix( new THREE.Matrix4().makeRotationY(0-Math.PI/2));
    lithoLeft.applyMatrix( new THREE.Matrix4().makeTranslation(0-pixelWidth/2,0,(actualThicknessInMM*vertexPixelRatio)/2));
    toGeometry.merge(lithoLeft);
    
    var lithoRight = new THREE.PlaneGeometry( (actualThicknessInMM*vertexPixelRatio),pixelHeight);
    lithoRight.applyMatrix( new THREE.Matrix4().makeRotationY(Math.PI/2));
    lithoRight.applyMatrix( new THREE.Matrix4().makeTranslation((pixelWidth/2),0,(actualThicknessInMM*vertexPixelRatio)/2));
    toGeometry.merge(lithoRight);
    
    var lithoTop = new THREE.PlaneGeometry( (actualThicknessInMM*vertexPixelRatio),pixelWidth);
    lithoTop.applyMatrix( new THREE.Matrix4().makeRotationZ(Math.PI/2));
    lithoTop.applyMatrix( new THREE.Matrix4().makeRotationX(0-Math.PI/2));
    lithoTop.applyMatrix( new THREE.Matrix4().makeTranslation(0,pixelHeight/2,(actualThicknessInMM*vertexPixelRatio)/2));
    toGeometry.merge(lithoTop);

    var lithoBottom = new THREE.PlaneGeometry( (actualThicknessInMM*vertexPixelRatio),pixelWidth);
    lithoBottom.applyMatrix( new THREE.Matrix4().makeRotationZ(Math.PI/2));
    lithoBottom.applyMatrix( new THREE.Matrix4().makeRotationX(Math.PI/2));
    lithoBottom.applyMatrix( new THREE.Matrix4().makeTranslation(0,0-pixelHeight/2,(actualThicknessInMM*vertexPixelRatio)/2));
    toGeometry.merge(lithoBottom);
    
    toGeometry.applyMatrix( new THREE.Matrix4().makeTranslation(0,0,0-(actualThicknessInMM*vertexPixelRatio))); // move under of base plane;
    toGeometry.applyMatrix( new THREE.Matrix4().makeRotationY(Math.PI)); // flip it over;

    if (baseDepth!==0) {
        var lithoBase=new THREE.CubeGeometry(pixelWidth,baseDepth*vertexPixelRatio,borderThicknessInMM*vertexPixelRatio);
        lithoBase.applyMatrix( new THREE.Matrix4().makeRotationX(Math.PI/2)); 
        lithoBase.applyMatrix( new THREE.Matrix4().makeTranslation(0,pixelHeight/2-(borderThicknessInMM/2)*vertexPixelRatio,(baseDepth*vertexPixelRatio)/2)); 
        toGeometry.merge(lithoBase);
    }
    
}

function setUp3DScene(lithoMesh,width,height) {
    updatingScene=true;
    try {
        scene = new THREE.Scene();

        var baseWidth = 900;
        var divisions = Math.floor(baseWidth/(vertexPixelRatio*10)); // 10mm grid
        
        var groundMaterial=new THREE.MeshPhongMaterial({ color: 0x808080, wireframe: true, shininess: 0 });
        var groundPlane = new THREE.PlaneGeometry(baseWidth, baseWidth, divisions, divisions);
        var ground = new THREE.Mesh(groundPlane,groundMaterial);
        scene.add(ground);
        
        var spotLight = new THREE.SpotLight(0xffffff, 1, 0);
        spotLight.position.set(-1000, 1000, 1000);
        spotLight.castShadow = false;
        scene.add(spotLight);

        var pointLight = new THREE.PointLight(0xffffff, 1, 0);
        pointLight.position.set(3000, -4000, 3500);
        scene.add(pointLight);
        
        var material = new THREE.MeshPhongMaterial({color:0x001040,specular: 0x006080,shininess: 10 });

        var lithoPart = new THREE.Mesh( lithoMesh, material );
        scene.add(lithoPart);
        
        camera.position.z = width*1.6;
        
    } catch (e) {
        console(e.message);
    }
    updatingScene=false;
}

function generateSTL(geometry,name){
    var vertices = geometry.vertices;
    var faces     = geometry.faces;
 
    function vertexAsString(vert){
      return vert.x/vertexPixelRatio+" "+vert.y/vertexPixelRatio+" "+vert.z/vertexPixelRatio;
    }
    
    function faceAsString(index){
        return "facet normal "+vertexAsString( faces[index].normal )+" \nouter loop \n" +
        "vertex "+vertexAsString( vertices[ faces[index].a ])+" \n" +
        "vertex "+vertexAsString( vertices[ faces[index].b ])+" \n" +
        "vertex "+vertexAsString( vertices[ faces[index].c ])+" \n" +
        "endloop \nendfacet \n";
    }
    var stl = "solid "+name+"\n";
    for(var i = 0; i<faces.length; i++) {
        stl += faceAsString(i);
    }
    stl += ("endsolid "+name+"\n");
    return stl;
}
 
function saveTxtSTL( stlString, name ){  
  var blob = new Blob([stlString], {type: 'text/plain;charset=utf-8'});
  saveAs(blob, name + '.stl');
}
// Written by Paul Kaplan / Mark Durbin
function saveBinSTL( dataview, name ){  
    var blob = new Blob([dataview], {type: 'application/octet-binary'});
    saveAs(blob, name + '.stl');
}
function createBinSTL(geometry) {
 
  var writeVector = function(dataview, offset, vector, isLittleEndian) {
    offset = writeFloat(dataview, offset, vector.x/vertexPixelRatio, isLittleEndian);
    offset = writeFloat(dataview, offset, vector.y/vertexPixelRatio, isLittleEndian);
    return writeFloat(dataview, offset, vector.z/vertexPixelRatio, isLittleEndian);
  };
 
  var writeFloat = function(dataview, offset, float, isLittleEndian) {
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

    for(var n = 0; n < tris.length; n++) {
      offset = writeVector(dv, offset, tris[n].normal, isLittleEndian);
      offset = writeVector(dv, offset, verts[tris[n].a], isLittleEndian);
      offset = writeVector(dv, offset, verts[tris[n].b], isLittleEndian);
      offset = writeVector(dv, offset, verts[tris[n].c], isLittleEndian);
      offset += 2; // unused 'attribute byte count' is a Uint16
    }

    return dv;
}
