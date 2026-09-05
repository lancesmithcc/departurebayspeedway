// Regular LiDAR-derived ground samples in the game's east/south metre coordinates.
// Keep this independent of Three.js so the geographic contract can be tested offline.
export class ElevationGrid {
  constructor(metadata, values) {
    if(values.length!==metadata.nx*metadata.nz || metadata.nx<2 || metadata.nz<2 || !(metadata.grid_spacing_m>0))throw new Error('Invalid terrain DTM grid');
    Object.assign(this,metadata);this.values=values;
    this.x1=this.x0+(this.nx-1)*this.grid_spacing_m;
    this.z1=this.z0+(this.nz-1)*this.grid_spacing_m;
  }
  sample(x,z) {
    if(!Number.isFinite(x+z)||x<this.x0||x>this.x1||z<this.z0||z>this.z1)return null;
    const gx=(x-this.x0)/this.grid_spacing_m,gz=(z-this.z0)/this.grid_spacing_m;
    const i=Math.min(this.nx-2,Math.floor(gx)),j=Math.min(this.nz-2,Math.floor(gz));
    const u=gx-i,v=gz-j,k=j*this.nx+i,a=this.values[k],b=this.values[k+1],c=this.values[k+this.nx],d=this.values[k+this.nx+1];
    if([a,b,c,d].some(h=>!Number.isFinite(h)||h===this.no_data))return null;
    return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;
  }
  edgeDistance(x,z){return Math.min(x-this.x0,this.x1-x,z-this.z0,this.z1-z);}
}
