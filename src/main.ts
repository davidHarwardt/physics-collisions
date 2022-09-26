import './style.css'
import { Canvas2d, CanvasFullscreenSize } from "@david.harwardt/canvas-2d";
import { Vec2 } from '@david.harwardt/math';
import { Color } from '@david.harwardt/color';

const canvas = Canvas2d.fromParent(document.body);
const size = new CanvasFullscreenSize(canvas.element);

let settings = {
    wallsResetVel: false,
};
let uiWidth = 200;
let currentRadius = 50;
let currentPos = new Vec2(window.innerWidth - (uiWidth / 2), window.innerHeight - (uiWidth / 2));
let currentDrag: { pos: Vec2, pointer: number } | undefined = undefined
let currentMass: number = 1;
let selectedItem: CircleObject | undefined;
let freq = 10;
let lineWidth = 1 / 2;

// {
    const drawFreqDisplay = document.querySelector<HTMLSpanElement>(".draw-freq-display")!;
    const drawFreqInputRange = document.querySelector<HTMLInputElement>(".draw-freq-input-range")!;
    const drawFreqInputNumber = document.querySelector<HTMLInputElement>(".draw-freq-input-number")!;

    drawFreqInputNumber.addEventListener("input", ev => updateFreq(drawFreqInputNumber.value as unknown as number));
    drawFreqInputRange.addEventListener("input", ev => updateFreq(drawFreqInputRange.value as unknown as number));

    function updateFreq(v: number) {
        v = parseInt(v as any);
        freq = v;
        drawFreqDisplay.innerHTML = freq.toString();
        (drawFreqInputNumber.value as any) = freq;
        (drawFreqInputRange.value as any) = freq;
    }

    const wallReflectInput = document.querySelector<HTMLInputElement>(".wall-reflect-input")!;
    wallReflectInput.addEventListener("input", ev => { settings.wallsResetVel = !wallReflectInput.checked });

    const clearBtn = document.querySelector<HTMLDivElement>(".clear-btn")!;
    clearBtn.addEventListener("click", _ => objects.forEach(v => v["points"] = []));
    
    const deleteObjBtn = document.querySelector<HTMLDivElement>(".delete-obj-btn")!;
    deleteObjBtn.addEventListener("click", _ => {
        if(selectedItem) {
            objects.splice(objects.findIndex(v => selectedItem === v), 1);
            selectedItem = undefined;
        }
    })

    const radiusDisplay = document.querySelector<HTMLDivElement>(".radius-display")!;
    const radiusInputRange = document.querySelector<HTMLInputElement>(".radius-input-range")!;
    const radiusInputNumber = document.querySelector<HTMLInputElement>(".radius-input-number")!;
    radiusInputRange.addEventListener("input", _ => updateRadius(radiusInputRange.value));
    radiusInputNumber.addEventListener("input", _ => updateRadius(radiusInputNumber.value));
    function updateRadius(m: string) {
        let v = parseInt(m);
        if(selectedItem) {
            selectedItem.radius = v;
        }
        currentRadius = v;
        
        radiusDisplay.innerHTML = v.toString();
        (radiusInputRange.value as any) = v;
        (radiusInputNumber.value as any) = v;
    }

    const massInputNumber = document.querySelector<HTMLInputElement>(".mass-input-number")!;
    massInputNumber.addEventListener("input", _ => {updateMass(massInputNumber.value)});
    function updateMass(m: string) {
        let v = parseFloat(m);
        massInputNumber.value = m;
        currentMass = v;
        if(selectedItem) {
            selectedItem.mass = v;
        }
    }
// }

let time = 0;

type CollisionResult = {
    normal: Vec2,
    position: Vec2,
};

class CircleObject {
    public pos: Vec2;       // position in meters from origin
    private nextPos: Vec2;
    public vel: Vec2;       // velocity in meters / second
    private nextVel: Vec2;
    public disabled: boolean = false;
    
    public radius: number;  // radius in meters
    public mass: number;    // mass in grams
    
    private points: { pos: Vec2, time: number }[] = [];

    constructor(pos: Vec2, radius: number, mass: number) {
        this.pos = pos;
        this.nextPos = pos.copy();
        this.vel = new Vec2(0, 0);
        this.nextVel = this.vel.copy();
        this.radius = radius;
        this.mass = mass;
    }

    public get impulse(): Vec2 { return this.vel.multS(this.mass) }
    public set impulse(vel: Vec2) { this.vel = vel.divS(this.mass) }

    public draw(canvas: Canvas2d) {
        canvas.drawCircle(this.pos, this.radius);
    }

    public drawBg(canvas: Canvas2d) {
        let lastTime = this.points[0]?.time;
        let timeSlice = 1 / freq;
        for(let i = 1; i < this.points.length; i++) {
            while((this.points[i].time - lastTime) > timeSlice) { lastTime += timeSlice }
            if((this.points[i].time - lastTime) < (timeSlice * lineWidth)) {
                canvas.drawLine(this.points[i - 1].pos, this.points[i].pos, { width: 2, cap: "round" });
            }
        }
    }

    public update(dt: number, objects: CircleObject[], canvas: Canvas2d) {
        let nextPos = this.pos.add(this.vel.multS(dt));
        const pos = new Vec2(0, 0);
        const dim = new Vec2(window.innerWidth - uiWidth, window.innerHeight);

        let rect = this.outsideRect(nextPos, pos, dim);
        if(rect.genral) {

            if(rect.x) {
                let overshoot = this.getOvershoot(nextPos, pos, dim);
                let normal = this.getNormal(rect);
                let collisionPoint = nextPos.sub(overshoot);

                nextPos = collisionPoint.add(CircleObject.reflect(overshoot, new Vec2(normal.x, 0)));
                this.nextVel = this.vel.mult(new Vec2(-1, 1));
            }
            if(rect.y) {
                let overshoot = this.getOvershoot(nextPos, pos, dim);
                let normal = this.getNormal(rect);
                let collisionPoint = nextPos.sub(overshoot);

                nextPos = collisionPoint.add(CircleObject.reflect(overshoot, new Vec2(0, normal.y)));
                this.nextVel = this.nextVel.mult(new Vec2(1, -1));
            }

            if(settings.wallsResetVel) { this.nextVel = new Vec2(0, 0); this.vel = this.nextVel.copy() }
            // let overshoot = this.getOvershoot(nextPos, new Vec2(0, 0), new Vec2(window.innerWidth, window.innerHeight));
            // let normal = this.getNormal(rect);
            // let collisionPoint = nextPos.sub(overshoot);

            // nextPos = collisionPoint.add(CircleObject.reflect(overshoot, normal));
            // this.vel = this.vel.mult(new Vec2(rect.x ? -1 : 1, rect.y ? -1 : 1));
        }

        for(const obj of objects) {
            if(obj === this) continue;
            let coll = this.getCollision(obj);
            if(coll) {
                let overshoot = coll.position.sub(nextPos);
                canvas.drawCircle(coll.position, 10, { color: Color.red });

                // nextPos = coll.position.add(CircleObject.reflect(overshoot, coll.normal));
                nextPos = coll.position.add(overshoot);
                nextPos = coll.position;

                canvas.drawCircle(nextPos, 5, { color: Color.blue });

                let vel = this.vel.multS(this.mass - obj.mass).add(obj.vel.multS(2 * obj.mass)).divS(this.mass + obj.mass);
                // let vel = (this.impulse.add(obj.impulse)).divS(this.mass + obj.mass);
                this.nextVel = vel;
                // this.nextVel = CircleObject.reflect(this.vel, coll.normal);
            }
        }

        this.nextPos = nextPos;
    }

    public lateUpdate(dt: number) {

        this.vel = this.nextVel;
        if(this.points.length < 1 || this.points[this.points.length - 1].pos.sub(this.pos).magnitude() > 1) {
            this.points.push({ time, pos: this.pos });
        }
        this.pos = this.nextPos;

        // drag: remove later
        this.nextVel = this.nextVel.multS(0.99);
    }

    public static reflect(v: Vec2, normal: Vec2): Vec2 { return v.sub(normal.multS(2 * v.dot(normal))) }

    private getNormal(sides: { left: boolean, right: boolean, top: boolean, bottom: boolean}): Vec2 {
        return new Vec2((sides.left ? 1 : 0) + (sides.right ? -1 : 0), (sides.top ? -1 : 0) + (sides.bottom ? 1 : 0));
    }

    private getCollision(circle: CircleObject): CollisionResult | undefined {
        if(circle.pos.sub(this.pos).magnitude() < (this.radius + circle.radius)) {
            let normal = this.pos.sub(circle.pos).normalized();
            let position = circle.pos.add(normal.multS(circle.radius + this.radius));
            return { normal, position };
        }
        return undefined
    }

    private getOvershoot(p: Vec2, pos: Vec2, dim: Vec2): Vec2 {
        let rect = this.outsideRect(p, pos, dim);
        return new Vec2(
            rect.left ? (pos.x + p.x - this.radius) : (rect.right ? p.x - (pos.x + dim.x) + this.radius : 0),
            rect.top ? (pos.y + p.y - this.radius) : (rect.bottom ? p.y - (pos.y + dim.y) + this.radius : 0),
        )
    }

    private outsideRect(p: Vec2, pos: Vec2, dim: Vec2): {
        x: boolean, y: boolean,
        left: boolean, right: boolean, top: boolean, bottom: boolean,
        genral: boolean,
    } {
        let left = (p.x - this.radius) < pos.x;
        let right = (p.x + this.radius) > (pos.x + dim.x);
        let top = (p.y - this.radius) < pos.y;
        let bottom = (p.y + this.radius) > (pos.y + dim.y);
        return {
            genral: left || right || top || bottom,
            x: left || right,
            y: top || bottom,
            left, right, top, bottom,
        };
    }
}


class TouchPoint {
    public pos: Vec2;
    private oldPos: Vec2;
    public readonly dragging?: CircleObject;

    constructor(pos: Vec2, dragging?: CircleObject) {
        this.pos = pos;
        this.oldPos = this.pos.copy();
        this.dragging = dragging;
    }

    public setPos(pos: Vec2) { this.pos = pos }

    public delta() {
        const delta = this.pos.sub(this.oldPos);
        this.oldPos = this.pos.copy();
        return delta;
    }
}

let touches: Map<number, TouchPoint> = new Map();
window.addEventListener("touchstart", ev => {
    // ev.preventDefault();
    for(let i = 0; i < ev.touches.length; i++) {
        let touch = ev.touches[i];

        let touchPos = new Vec2(touch.clientX, touch.clientY);
        if(touchPos.sub(currentPos).magnitude() < currentRadius) {
            currentDrag = { pos: touchPos, pointer: touch.identifier };
        }
        let dragging = undefined;
        for(const object of objects) {
            if(object.pos.sub(touchPos).magnitude() < object.radius) {
                dragging = object;
                dragging.disabled = true;
                break;
            }
        }
        
        touches.set(touch.identifier, new TouchPoint(touchPos, dragging));
    }
}, { passive: false });

canvas.element.addEventListener("touchmove", ev => {
    ev.preventDefault();
    for(let i = 0; i < ev.touches.length; i++) {
        let touch = ev.touches[i];
        touches.get(touch.identifier)?.setPos(new Vec2(touch.clientX, touch.clientY));
    }
}, { passive: false });

canvas.element.addEventListener("click", ev => {
    const pos = new Vec2(ev.clientX, ev.clientY);
    let found = false;
    for(const obj of objects) {
        if(obj.pos.sub(pos).magnitude() < obj.radius) {
            selectedItem = obj;
            updateMass(selectedItem.mass.toString());
            updateRadius(selectedItem.radius.toString());
            found = true;
            break;
        }
    }
    if(!found) { selectedItem = undefined }
});


canvas.element.addEventListener("dblclick", ev => {
    ev.preventDefault();
    const pos = new Vec2(ev.clientX, ev.clientY);
    let found = false;
    for(const obj of objects) {
        if(obj.pos.sub(pos).magnitude() < obj.radius) {
            obj["points"] = [];
            break;
        }
    }
    if(!found) { selectedItem = undefined }
});

window.addEventListener("touchend", ev => {
    // ev.preventDefault();
    for(let i = 0; i < ev.changedTouches.length; i++) {
        if(currentDrag && ev.changedTouches[i].identifier === currentDrag.pointer) {
            if(canPlaceDragging()) {
                objects.push(new CircleObject(currentDrag.pos, currentRadius, currentMass))
            }
            currentDrag = undefined;
        }
        let dragging = touches.get(ev.changedTouches[i].identifier)?.dragging;
        if(dragging) {
            dragging.disabled = false;
        }
        touches.delete(ev.changedTouches[i].identifier);
    }
}, { passive: false });

function canPlaceDragging(): boolean {
    if(!currentDrag) return false;
    for(const obj of objects) {
        if(obj.pos.sub(currentDrag.pos).magnitude() < (currentRadius + obj.radius)) {
            return false;
        }
    }
    return true;
}

let objects: CircleObject[] = [
    // new CircleObject(new Vec2(100, 100), 50, 1),
    // new CircleObject(new Vec2(300, 100), 90, 2),
    // new CircleObject(new Vec2(400, 100), 50, 1),
    // new CircleObject(new Vec2(600, 200), 100, 1),
];

let lastTime = Date.now();
function draw() {
    let now = Date.now();
    let dt = (now - lastTime) / 1000;
    canvas.clear();
    canvas.beginDraw();
    // todo: request fullscreen


    // canvas.drawCircle(new Vec2(100, 100), 100);

    objects.forEach(v => v.drawBg(canvas));
    objects.forEach(v => v.draw(canvas));
    if(selectedItem) {
        canvas.drawCircle(selectedItem.pos, selectedItem.radius + 10, { fill: false, borderWidth: 2, borderColor: Color.red });
    }

    objects.forEach(v => { v.update(1, objects, canvas) });


    objects.forEach(v => {
        v.lateUpdate(1);
    })

    touches.forEach((v, key) => {
        const delta = v.delta();
        canvas.drawCircle(v.pos, 10);

        if(v.dragging) {
            v.dragging.vel = delta;
            v.dragging["nextVel"] = delta;
        }
        if(currentDrag && currentDrag.pointer === key) {
            currentDrag.pos = currentDrag.pos.add(delta);
        }
    });

    currentPos = new Vec2(window.innerWidth - (uiWidth / 2), window.innerHeight - (uiWidth / 2));

    canvas.drawRect(new Vec2(window.innerWidth - uiWidth, 0), new Vec2(uiWidth, window.innerHeight), { color: Color.hex("#111111") });

    canvas.drawCircle(currentPos, currentRadius);

    if(currentDrag) {
        canvas.drawCircle(currentDrag.pos, currentRadius, { color: canPlaceDragging() ? Color.hex("#004400") : Color.hex("#222222") })
    }

    canvas.endDraw();

    // todo: add dt to time
    time += dt;
    
    lastTime = now;
    requestAnimationFrame(draw);
}

requestAnimationFrame(draw);