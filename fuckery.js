const VERTEX_SHADER = `#version 300 es

in vec2 a_position;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es

precision mediump float;

const float E = 2.71828182845904523536028747135266250;
const float PI = 3.14159265358979323846264338327950288;
const float RADIUS = 6378137.0;
const float HALF_SIZE = PI * RADIUS;

uniform vec2 u_resolution;
uniform vec2 u_data_resolution;
uniform mat3 u_pix_to_map;
uniform mat3 u_gps_to_data;
uniform sampler2D u_data;
uniform sampler2D u_colormap;
uniform float u_product_min;
uniform float u_product_max;
uniform float u_product_cutoff;
uniform float u_alpha;
uniform float u_no_data;

out vec4 fragColor;

vec2 apply(mat3 transform, vec2 coordinate) {
    float x = (transform[0][0] * coordinate.x) + (transform[0][1] * coordinate.y) + transform[0][2];
    float y = (transform[1][0] * coordinate.x) + (transform[1][1] * coordinate.y) + transform[1][2];

    return vec2(x, y);
}

vec2 mapToGPS(vec2 coordinate) {
    return vec2(
        (180.0 * coordinate.x) / HALF_SIZE,
        (360.0 * atan(exp(coordinate.y / RADIUS))) / PI - 90.0
    );
}

vec2 screenSpaceToCanvasSpace(vec2 coordinate, vec2 resolution) {
    return vec2(
        coordinate.x,
        -1.0 * (coordinate.y - resolution.y)
    );
}

float getDataValue(vec2 coords) {
    return texture(u_data, vec2(coords.x / u_data_resolution.x, coords.y / u_data_resolution.y)).x;
}

float bilerp(float x, float y, float x1, float x2, float y1, float y2, float z11, float z12, float z21, float z22) {
    // Sometimes the floor and ceiling values are too close to each other; if this is the case, just return the average.
    if (abs(x2 - x1) < 0.00001 || abs(y2 - y1) < 0.00001) { 
        return (z11 + z12 + z21 + z22) / 4.0;
    }

    float zxy1 = (( (x2 - x) / (x2 - x1) ) * z11) + (( (x - x1) / (x2 - x1) ) * z21);
    float zxy2 = (( (x2 - x) / (x2 - x1) ) * z12) + (( (x - x1) / (x2 - x1) ) * z22);

    return (( (y2 - y) / (y2 - y1) ) * zxy1) + (( (y - y1) / (y2 - y1) ) * zxy2);
}

float normalizeValue(float value) {
    return (value - u_product_min) / (u_product_max - u_product_min); 
}

vec3 getColor(float normalizedValue) {
    return texture(u_colormap, vec2(normalizedValue, 0.5)).rgb;
}

void main() {
    vec2 adjustedCoords = screenSpaceToCanvasSpace(gl_FragCoord.xy, u_resolution);

    vec2 mapCoords = apply(u_pix_to_map, adjustedCoords);

    vec2 gpsCoords = mapToGPS(mapCoords);

    vec2 dataCoords = apply(u_gps_to_data, gpsCoords);

    if (dataCoords.x < 0.0 || dataCoords.x > u_data_resolution.x || dataCoords.y < 0.0 || dataCoords.y > u_data_resolution.y) {
        fragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }

    float x1 = floor(dataCoords.x);
    float x2 = ceil(dataCoords.x);
    float y1 = floor(dataCoords.y);
    float y2 = ceil(dataCoords.y);    

    float z11 = getDataValue(vec2(x1, y1));
    float z12 = getDataValue(vec2(x1, y2));
    float z21 = getDataValue(vec2(x2, y1));
    float z22 = getDataValue(vec2(x2, y2));

    if (abs(z11 - u_no_data) < 0.01) {
        fragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }

    if (abs(z12 - u_no_data) < 0.01) {
        fragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }

    if (abs(z21 - u_no_data) < 0.01) {
        fragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }

    if (abs(z22 - u_no_data) < 0.01) {
        fragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }


    float value = bilerp(dataCoords.x, dataCoords.y, x1, x2, y1, y2, z11, z12, z21, z22);

    float normalizedValue = normalizeValue(value);

    vec3 color = getColor(normalizedValue);

    float normalizedCutoff = normalizeValue(u_product_cutoff);

    float alpha = u_alpha;

    if (normalizedValue < normalizedCutoff) {
        alpha -= (u_alpha * ((normalizedCutoff - normalizedValue) / normalizedCutoff));
    }

    fragColor = vec4(color, alpha);
}
`;

function createShader(context, type, source) {
    const shader = context.createShader(type);

    if (!shader) {
        return null;
    }

    context.shaderSource(shader, source);
    context.compileShader(shader);

    const success = context.getShaderParameter(shader, context.COMPILE_STATUS);
    if (success) {
        return shader;
    }

    console.error(context.getShaderInfoLog(shader));
    context.deleteShader(shader);

    return null;
}

function createGlProgram(context, vertSource, fragSource) {
    const vertexShader = createShader(
        context,
        context.VERTEX_SHADER,
        vertSource
    );
    const fragmentShader = createShader(
        context,
        context.FRAGMENT_SHADER,
        fragSource
    );

    if (!vertexShader || !fragmentShader) {
        return null;
    }

    const program = context.createProgram();

    if (!program) {
        return program;
    }

    context.attachShader(program, vertexShader);
    context.attachShader(program, fragmentShader);
    context.linkProgram(program);

    const success = context.getProgramParameter(program, context.LINK_STATUS);
    if (success) {
        return program;
    }

    console.error(context.getProgramInfoLog(program));
    context.deleteProgram(program);

    return null;
}

const canvas = document.createElement("canvas");
const context = canvas.getContext("webgl2");

const program = createGlProgram(context, VERTEX_SHADER, FRAGMENT_SHADER);

if (!program) {
    throw Error("could not create webgl2 program");
}

context.useProgram(program);

// Get location of a_position in the vertex shader.
const position_loc = context.getAttribLocation(program, "a_position");
console.log("a_position", position_loc);

// uniform vec2 u_resolution;
// uniform vec2 u_data_resolution;
// uniform mat3 u_pix_to_map;
// uniform mat3 u_gps_to_data;
// uniform sampler2D u_data;
// uniform sampler2D u_colormap;
// uniform float u_product_min;
// uniform float u_product_max;
// uniform float u_product_cutoff;
// uniform float u_alpha;
// uniform float u_no_data;

// Get uniform locations
for (const uniform of [
    "u_resolution",
    "u_data_resolution",
    "u_pix_to_map",
    "u_gps_to_data",
    "u_data",
    "u_colormap",
    "u_product_min",
    "u_product_max",
    "u_product_cutoff",
    "u_alpha",
    "u_no_data",
]) {
    const loc = context.getUniformLocation(program, uniform);

    if (!loc) {
        throw Error(`could not get location for uniform ${uniform}`);
    }

    console.log(uniform, loc);
}
