import React from 'react'
import { Star1 as IcStar } from 'iconsax-react'

/* Your own list — ranked or unranked. Working name; this page gets named later. */
export function FavouritesView({ library }) {
  const favs = (library.titles || []).filter((t) => t.favorite)
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Favourites</h1>
          <p className="page-sub">Your own list, ranked or not</p>
        </div>
      </header>
      {favs.length === 0 && (
        <div className="empty">
          <div className="empty-art">
            <IcStar size={60} color="currentColor" variant="Bulk" />
          </div>
          <h2>No favourites yet</h2>
          <p>Star a movie or a show and it lands here. Number them if you want a ranking.</p>
        </div>
      )}
    </div>
  )
}
