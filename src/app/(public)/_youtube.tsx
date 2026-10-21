import { SCHOOL } from "@/shared/config/school";
import { Icon } from "@/shared/ui/icon";
import { isLite } from "@/shared/lib/lite";

/**
 * The school's latest YouTube uploads in one player (it moves through the uploads playlist).
 * In data-saver mode the player isn't loaded at all: a link to the channel shows instead.
 */
export async function YouTubeVideos() {
  const lite = await isLite();
  return (
    <div className="stack">
      {lite ? (
        <a className="video-frame video-lite" href={SCHOOL.social.youtube} target="_blank" rel="noopener noreferrer">
          <span><Icon name="youtube" />Watch on YouTube</span>
          <small>The video player is off while Data saver is on</small>
        </a>
      ) : (
        <div className="video-frame">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/videoseries?list=${SCHOOL.social.youtubeUploads}&rel=0`}
            title={`${SCHOOL.name} videos on YouTube`}
            loading="lazy"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      )}
      <div><a className="btn" href={SCHOOL.social.youtube} target="_blank" rel="noopener noreferrer"><Icon name="youtube" size="sm" />Visit our YouTube channel</a></div>
    </div>
  );
}
