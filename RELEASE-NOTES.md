### Release Notes

### 📦 0.7.0

-   **Revamped playback**. The audio playback component has been re-built to support gapless playback, resampling, and better performance than the previous web-based version.

### 📦 0.6.0

-   **Library v2.** The library is now rendered on a canvas, only rendering the visible rows. Scrolling through large libraries is much faster and more responsive, as is resizing the window.
-   **Faster and sleeker import UX.** Import is now almost 10x faster, enabled by multithreading the metadata parsing in the Rust backend. Also, a nice cassete animation while you wait :)
-   **Lyrics view**. You can now view lyrics for the current song (requires Genius API key in settings).
-   **Spectroscope visualizer** The visualizer is now positioned in the bottom bar (when enough space is available)
-   **Pick up where you left off**. The player remembers the last song and seek position when opening the app.
-   **Add country data to your entire library at once**. When you don't have any origin country data, add it in bulk from the map view.
-   Drag and drop library columns to re-order.
-   **Auto-watch folders for changes.** Configure the paths to watch in settings.
-   ID3v1 is now supported in the tagger (will be upgraded to ID3v2.4 on write)
-   You can now **Fetch album art** from Wikipedia from the track info overlay.

### 📦 0.5.0

-   **A brand new Map view!** Click on the "MAP" view to display your library as a map 🗺 Click on countries to play
-   **Assign Origin Country.** For the map to be useful, enrich your library with country data (right click track → "Origin country"), and it will be added to all songs by that artist.
-   **Stats view with AI model support. 📊** The stats view shows you insights into your library. Play count, popular genre and countries, as well as a timeline view that shows albums by release date.
    **🤖 Get insights via an AI model.** Musicat is now integrated with two APIs - Open AI's and Ollama (local), which analyse your music library and provide further insights. At the moment, it asks the model for sentiment analysis, a brief summary and some fun facts about your library. To configure AI, open settings.
-   **Shuffle.** You can finally shuffle the current play queue.
-   **Sticky artists + albums** As you scroll, the artist and album acts as a sticky header.
-   **Button to scroll to Now Playing track**
-   **Column picker**. Right-click on the column header to open the column picker.

### 📦 0.4.0 _"For the love of music!"_

-   **Introducing the Artist's Toolkit** - helping you write songs and organize musical ideas inside your music player. How cool is that! You can use the Scrapbook to keep your "messy" ideas, tag them and easily find them later.
    You can create new songs, attach audio, video, image files (or just drag ideas from the scrapbook), and even write lyrics!
-   **Album View!** Browse and play albums in your library, with all the artwork on display, and beautifully animated CD covers.
-   The default sort in the Library is now the 'discography' sort. As you scroll, you see Artists in alphabetical order, albums in release date order, and tracks in the right order
-   The default visualizer is now an oscilloscope, with a full screen option. More visualizers will be added in later releases.

### 📦 0.3.0 _"Enhance, enhance!"_

-   The new Smart Query section allows you to create powerful query chains, made up of condition blocks such as "where genre is x" and "released between year1 and year2".

### 📦 0.2.0 _"Very meta"_

-   Right-click on track -> "Info & metadata" to view and edit the metadata tags from the source file.
-   You can update any existing tag, add or replace an image encoded in the file.

### 📦 0.1.1 _"Search and you shall find, maybe"_

-   Search for tracks in the sidebar! Or press Cmd/Ctr + F.  
    Note: this only works for tracks/artists/albums that "start with" the query (words in the middle don't match, yet)

### 📦 0.1 _"The first one"_

-   Music player with support MP3, FLAC, WAV, AAC, OGG
-   Library database that links to original file location
-   Reading ID3, ID3v2 and Vorbis (FLAC) tags
-   Sorting by title, artist, album, genre or year
