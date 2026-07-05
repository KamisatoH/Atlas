export interface PoiHit {
  name: string;
  lng: number;
  lat: number;
  address?: string;
  /** 所属地级市，用于限定后续搜索范围 */
  city?: string;
}
