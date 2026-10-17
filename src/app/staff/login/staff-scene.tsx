import Image from "next/image";

// Decorative scene for the staff sign-in: school photos in a gate-scanner viewfinder. Pure CSS animation.
export function StaffScene() {
  return (
    <div className="sscene" aria-hidden="true">
      <div className="sstage">
        <div className="sphoto back"><Image src="/images/irene.jpg" alt="" fill sizes="240px" /></div>
        <div className="sphoto front">
          <Image src="/images/cultural-day/15.jpg" alt="" fill sizes="(max-width: 860px) 200px, 380px" priority />
          <i className="sbeam" />
          <i className="sshine" />
        </div>
        <i className="scorner tl" /><i className="scorner tr" /><i className="scorner bl" /><i className="scorner br" />
        <div className="schip"><b>✓</b><span>Clocked in<small>07:52 · Main gate</small></span></div>
      </div>
    </div>
  );
}
