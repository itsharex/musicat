import { open } from "@tauri-apps/api/dialog";
import ImportWorker from "../ImportWorker?worker";
import { invoke } from "@tauri-apps/api";
import { BaseDirectory, exists, readDir } from "@tauri-apps/api/fs";
import { audioDir } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import { appWindow } from "@tauri-apps/api/window";
import md5 from "md5";
import * as musicMetadata from "music-metadata-browser";
import type {
    Album,
    LookForArtResult,
    MetadataEntry,
    Song,
    TagType,
    ToImport
} from "src/App";
import { get } from "svelte/store";
import { getImageFormat, isAudioFile, isImageFile } from "../utils/FileUtils";
import { getMapForTagType, getTagTypeFromCodec } from "./LabelMap";
import { db } from "./db";
import {
    bottomBarNotification,
    importStatus,
    shouldShowToast,
    songsJustAdded,
    userSettings
} from "./store";
import { cacheArtwork } from "./Cacher";

let addedSongs: Song[] = [];

export async function getMetadataFromFile(filePath: string, fileName: string) {
    if (!isAudioFile(fileName)) {
        return null;
    }
    return await musicMetadata.fetchFromUrl(convertFileSrc(filePath), {
        duration: false,
        skipCovers: false,
        skipPostHeaders: true,
        includeChapters: false
    });
}

/**
 * When we need to get the metadata directly from the file on disk.
 * @param song
 * @returns
 */
export async function readMappedMetadataFromSong(
    song: Song
): Promise<{ mappedMetadata: MetadataEntry[]; tagType: TagType }> {
    console.log("song read", song);
    const metadata = await getMetadataFromFile(song.path, song.file);
    console.log("meta", metadata);
    const tagType = metadata.format.tagTypes.length
        ? metadata.format.tagTypes[0]
        : getTagTypeFromCodec(metadata.format.codec);
    const map = getMapForTagType(tagType, false);
    const mappedMetadata: MetadataEntry[] = tagType
        ? metadata?.native[tagType]
              ?.map((tag) => ({
                  genericId: map && tag ? map[tag.id] : "unknown",
                  id: tag.id,
                  value: tag.value
              }))
              .filter((tag) => typeof tag.value === "string") ?? []
        : [];
    return { mappedMetadata, tagType };
}

export async function getSongFromMetadata(
    filePath: string,
    fileName: string,
    metadata: musicMetadata.IAudioMetadata
) {
    // console.log('metadata: ', metadata);
    const fileHash = md5(filePath);
    const tagType = metadata.format.tagTypes.length
        ? metadata.format.tagTypes[0]
        : null;
    const map = getMapForTagType(tagType, false);
    const metadataMapped: MetadataEntry[] = tagType
        ? metadata.native[tagType]
              .map((tag) => ({
                  genericId: map && tag ? map[tag.id] : "unknown",
                  id: tag.id,
                  value: tag.value
              }))
              .filter((tag) => typeof tag.value === "string")
        : [];
    try {
        const songToAdd: Song = {
            id: fileHash,
            path: filePath,
            file: fileName,
            title: metadata.common.title || fileName || "",
            artist: metadata.common.artist || "",
            album: metadata.common.album || "",
            year: metadata.common.year || 0,
            genre: metadata.common.genre || [],
            composer: metadata.common.composer || [],
            trackNumber: metadata.common.track.no || -1,
            duration: `${(~~(metadata.format.duration / 60))
                .toString()
                .padStart(2, "0")}:${(~~(metadata.format.duration % 60))
                .toString()
                .padStart(2, "0")}`,
            metadata: metadataMapped,
            fileInfo: metadata.format,
            isFavourite: false,
            playCount: 0,
            markers: [],
            dateAdded: new Date().getTime()
        };
        console.log("song: ", songToAdd);
        // Remove image, too large
        let artworkIdx = songToAdd.metadata.findIndex(
            (t) => t.id === "METADATA_BLOCK_PICTURE"
        );
        if (artworkIdx > -1) {
            songToAdd.metadata.splice(artworkIdx, 1);
        }
        return songToAdd;
    } catch (e) {
        console.error(e);
    }
}

async function getAlbumFromSong(song: Song) {
    const albumPath = song.path.replace(`/${song.file}`, "");
    const existingAlbum = await db.albums.get(
        md5(`${song.artist} - ${song.album}`.toLowerCase())
    );
    if (existingAlbum) {
        console.log(
            "existing album",
            `${song.artist} - ${song.album}`.toLowerCase()
        );
        existingAlbum.tracksIds.push(song.id);
        existingAlbum.trackCount++;
        if (!existingAlbum.artwork) {
            // Done separately in addArtworksToAllAlbums
        }
        return existingAlbum;
        // Re-order trackIds in album order?
    } else {
        console.log(
            "new album",
            `${song.artist} - ${song.album}`.toLowerCase()
        );

        const newAlbum: Album = {
            id: md5(`${song.artist} - ${song.album}`.toLowerCase()),
            title: song.album,
            artist: song.artist,
            genre: song.genre,
            duration: song.duration,
            path: song.path.replace(`/${song.file}`, ""),
            trackCount: 1,
            year: song.year,
            tracksIds: [song.id],
            lossless: song.fileInfo.lossless // Will only be true if all songs are lossless
        };
        // Artwork done in addArtworksToAllAlbums
        return newAlbum;
    }
}

async function updateAlbum(song: Song) {
    const albumToSet = await getAlbumFromSong(song);

    if (!albumToSet) {
        return;
    }
    await db.albums.put(albumToSet);
}

export async function addSong(
    filePath: string,
    fileName: string,
    singleFile = false,
    showToast = true
): Promise<Song | null> {
    shouldShowToast.set(showToast);
    if (singleFile) {
        songsJustAdded.set([]);
    }
    const songToAdd = await invoke<Song>("get_song_metadata", {
        event: { path: filePath, isImport: true }
    });
    try {
        if (!songToAdd) {
            return;
        }
        const existingSong = await db.songs.get(songToAdd.id);
        if (existingSong) {
            await db.songs.put({
                ...songToAdd,
                // Migrate user generated data
                originCountry: existingSong.originCountry,
                songProjectId: existingSong.songProjectId,
                isFavourite: existingSong.isFavourite,
                playCount: existingSong.playCount,
                dateAdded: existingSong.dateAdded
            });
        } else {
            await db.songs.put(songToAdd);
        }
        // updateAlbum(songToAdd, metadata);
    } catch (err) {
        console.error(err);
        // Catch 'already exists' case
    }
    if (singleFile) {
        songsJustAdded.update((songs) => {
            songs.push(songToAdd);
            return songs;
        });
    } else {
        addedSongs.push(songToAdd);
    }

    return await db.songs.get(songToAdd.id);
}

export async function importSong(
    songToAdd: Song,
    singleFile = false,
    showToast = true,
    shouldUpdateAlbum = false
): Promise<Song | null> {
    shouldShowToast.set(showToast);
    if (singleFile) {
        songsJustAdded.set([]);
    }
    try {
        if (!songToAdd) {
            return;
        }
        const existingSong = await db.songs.get(songToAdd.id);
        if (existingSong) {
            await db.songs.put({
                ...songToAdd,
                // Migrate user generated data
                originCountry: existingSong.originCountry,
                songProjectId: existingSong.songProjectId,
                isFavourite: existingSong.isFavourite,
                playCount: existingSong.playCount
            });
        } else {
            await db.songs.put(songToAdd);
        }
        if (shouldUpdateAlbum) {
            updateAlbum(songToAdd);
        }
    } catch (err) {
        console.error(err);
        // Catch 'already exists' case
    }
    if (singleFile) {
        songsJustAdded.update((songs) => {
            songs.push(songToAdd);
            return songs;
        });
    } else {
        addedSongs.push(songToAdd);
    }

    return await db.songs.get(songToAdd.id);
}

async function processEntries(entries) {
    for (const [index, entry] of entries.entries()) {
        if (entry.children) {
            importStatus.update((importStatus) => ({
                ...importStatus,
                currentFolder: entry.name,
                totalTracks: entry.children.length
            }));
            await processEntries(
                entry.children.filter((e) => !e.name.startsWith("."))
            );
        } else {
            await addSong(entry.path, entry.name);
            importStatus.update((importStatus) => ({
                ...importStatus,
                importedTracks: index
            }));
        }
    }
}

export async function addFolder(folderPath) {
    importStatus.update((importStatus) => ({
        ...importStatus,
        isImporting: true
    }));
    console.log("importStatus", importStatus);
    const entries = await readDir(folderPath, {
        dir: BaseDirectory.App,
        recursive: true
    });

    console.log("entries", entries);
    await processEntries(entries.filter((e) => !e.name.startsWith(".")));
    importStatus.update((importStatus) => ({
        ...importStatus,
        totalTracks: 0,
        importedTracks: 0,
        isImporting: false,
        backgroundImport: false,
        currentFolder: ""
    }));

    songsJustAdded.set(addedSongs);
    addedSongs = [];
}

export async function importPaths(
    selected: string[],
    background = true,
    percent = 0
) {
    importStatus.update((importStatus) => ({
        ...importStatus,
        currentFolder: selected[0],
        status: "Reading metadata",
        isImporting: true,
        backgroundImport: background,
        percent
    }));
    if (background) {
        bottomBarNotification.set({
            text: `Reading metadata`
        });
    }
    console.log("toImport called");

    await invoke<ToImport>("scan_paths", {
        event: {
            paths: selected,
            recursive: true
        }
    });

    if (background) {
        bottomBarNotification.set({
            text: "Adding to library",
            timeout: 2000
        });
    }
}

export async function startImportListener() {
    let allSongs: Song[] = [];
    let chunksToProcess: ToImport[] = []; // progress numbers
    let gotAllChunks = false;
    await appWindow.listen<ToImport>("import_chunk", async (event) => {
        let isBackground = false;
        importStatus.update((importStatus) => {
            isBackground = importStatus.backgroundImport;
            return {
                ...importStatus,
                status: "Writing to library",
                percent: event.payload.progress
            };
        });
        if (isBackground && allSongs.length) {
            bottomBarNotification.set({
                text: `Updating library (${allSongs.length} imported)`
            });
        }
        const toImport = event.payload;
        gotAllChunks = event.payload.progress === 100;
        if (toImport.songs.length) {
            chunksToProcess.push(toImport);
            allSongs.push(...toImport.songs);
            const worker = new ImportWorker();

            worker.postMessage({
                function: "handleImport",
                toImport: toImport
            });

            worker.onmessage = async (ev) => {
                switch (ev.data.event) {
                    case "handleImportDone":
                        // Import chunk completed
                        chunksToProcess.splice(
                            chunksToProcess.findIndex(
                                (c) => c.progress === ev.data.progress
                            ),
                            1
                        );
                        if (chunksToProcess.length === 0 && gotAllChunks) {
                            await addArtworksToAllAlbums(
                                allSongs,
                                isBackground,
                                false,
                                worker
                            );
                        }
                        break;
                    // Last step - finish after this
                    case "bulkAlbumPutDone":
                        importStatus.update((importStatus) => ({
                            ...importStatus,
                            status: "Processing albums",
                            isImporting: false,
                            backgroundImport: false,
                            percent: 100
                        }));

                        bottomBarNotification.set(null);
                        worker.terminate();

                        // Reset stuff
                        gotAllChunks = false;
                        allSongs = [];
                        chunksToProcess = [];
                        break;
                }
            };
        } else if (toImport.songs.length === 0 && toImport.progress === 100) {
            await addArtworksToAllAlbums(allSongs, isBackground, false);
        }
    });
}

export async function openTauriImportDialog() {
    // Open a selection dialog for directories
    const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: await audioDir()
    });
    if (Array.isArray(selected)) {
        // user selected multiple directories
    } else if (selected === null) {
        // user cancelled the selection
    } else {
        console.log("selected", selected);

        // user selected a single directory
        // addFolder(selected); // JS IMPLEMENTATION

        await importPaths([selected], false);
    }
}

async function checkFolderArtworkByFilename(folder, artworkFilename) {
    const src = folder + artworkFilename;
    let fileExists = false;
    try {
        fileExists = await exists(src);

        if (fileExists) {
            return {
                artworkSrc: convertFileSrc(src),
                artworkFormat: "image/jpeg",
                artworkFilenameMatch: artworkFilename
            };
        }
        return null;
    } catch (err) {
        console.error(err);
        return null;
    }
}

export async function lookForArt(
    songPath,
    songFileName
): Promise<LookForArtResult | null> {
    const folder = songPath.replace(songFileName, "");
    const filenamesToSearch = get(userSettings).albumArtworkFilenames;
    let foundResult: LookForArtResult | null = null;

    // Check are there any images in the folder?
    try {
        for (const filename of filenamesToSearch) {
            const artworkResult = await checkFolderArtworkByFilename(
                folder,
                filename
            );
            if (artworkResult?.artworkSrc) {
                foundResult = artworkResult;
            }
        }
    } catch (err) {
        console.error("Couldn't find artwork " + err);
    }

    if (!foundResult) {
        // Otherwise just use the first image that's in the folder
        try {
            const files = await readDir(folder);
            for (const filename of files) {
                const extension = filename.name.split(".").pop();
                let format = getImageFormat(extension);
                if (isImageFile(filename.name) && format) {
                    foundResult = {
                        artworkSrc: convertFileSrc(filename.path),
                        artworkFormat: format,
                        artworkFilenameMatch: filename.name
                    };
                }
            }
        } catch (err) {
            console.error("Couldn't find artwork " + err);
        }
    }
    // console.log("found result:", foundResult !== null, songFileName);
    return foundResult;
}

async function addAlbumArtworkFromSong(song: Song, newAlbum: Album) {
    const artwork = await lookForArt(song.path, song.file);
    if (artwork) {
        const artworkSrc = artwork.artworkSrc;
        const artworkFormat = artwork.artworkFormat;
        newAlbum.artwork = {
            src: artworkSrc,
            format: artworkFormat,
            size: {
                width: 200,
                height: 200
            }
        };
    } else if (song.artwork?.data && song.artwork?.format) {
        const artworkFormat = song.artwork.format;

        const path = await cacheArtwork(
            Uint8Array.from(song.artwork.data),
            newAlbum.id,
            song.artwork.format
        );

        newAlbum.artwork = {
            src: convertFileSrc(path),
            format: artworkFormat,
            size: {
                width: 200,
                height: 200
            }
        };
    }
}

export async function rescanAlbumArtwork(album: Album) {
    // console.log("adding artwork from song", song, newAlbum);

    const response = await invoke<ToImport>("scan_paths", {
        event: {
            paths: [album.path],
            recursive: false
        }
    });

    const artwork = await lookForArt(
        response.songs[0].path,
        response.songs[0].file
    );
    if (artwork) {
        const artworkSrc = artwork.artworkSrc;
        const artworkFormat = artwork.artworkFormat;
        album.artwork = {
            src: artworkSrc,
            format: artworkFormat,
            size: {
                width: 200,
                height: 200
            }
        };
    } else {
        Promise.all(
            response.songs.map(async (song) => {
                if (song.artwork?.data && song.artwork?.format) {
                    const artworkFormat = song.artwork.format;

                    const path = await cacheArtwork(
                        Uint8Array.from(song.artwork.data),
                        album.id,
                        song.artwork.format
                    );

                    // console.log("artworkSrc", artworkSrc);
                    album.artwork = {
                        src: convertFileSrc(path),
                        format: artworkFormat,
                        size: {
                            width: 200,
                            height: 200
                        }
                    };
                }
            })
        );
    }
}

/**
 * To improve performance, we process the album artworks (including looking in folders as fallbacks)
 * after the songs have been imported, and the albums have been added.
 * @param songs List of songs that have been imported
 */
export async function addArtworksToAllAlbums(
    songs: Song[],
    isBackground = false,
    override = false,
    worker: Worker = null
) {
    const albumsToPut = {};

    importStatus.update((importStatus) => ({
        ...importStatus,
        status: "Processing albums"
    }));

    if (isBackground) {
        bottomBarNotification.set({
            text: `Processing albums`
        });
    }

    // Here we can use Promise.all for concurrency since we don't depend on order
    await Promise.all(
        songs.map(async (song, idx) => {
            const albumPath = song.path.replace(`/${song.file}`, "");

            const existingAlbum =
                albumsToPut[
                    md5(`${song.artist} - ${song.album}`.toLowerCase())
                ] ||
                (await db.albums.get(
                    md5(`${song.artist} - ${song.album}`.toLowerCase())
                ));

            if (existingAlbum) {
                if (!existingAlbum.artwork) {
                    await addAlbumArtworkFromSong(song, existingAlbum);
                }
                if (!albumsToPut[existingAlbum.id]) {
                    albumsToPut[existingAlbum.id] = existingAlbum;
                }
                // Re-order trackIds in album order?
            } else {
                // console.error("Couldn't find album: ", song.album)
            }
        }, {})
    );

    if (!worker) {
        worker = new ImportWorker();
        worker.onmessage = (ev) => {
            if (ev.data === "bulkAlbumPut") {
                importStatus.update((importStatus) => ({
                    ...importStatus,
                    status: "Processing albums",
                    isImporting: false,
                    backgroundImport: false,
                    percent: 100
                }));

                bottomBarNotification.set(null);
                worker.terminate();
            }
        };
    } // Otherwise - handled by existing worker

    worker.postMessage({
        function: "bulkAlbumPut",
        albums: albumsToPut
    });
    // console.log("albums to put: ", albumsToPut);
}
export async function runScan() {
    const settings = get(userSettings);

    for (const folder of settings.foldersToWatch) {
        bottomBarNotification.set({
            text: `Scanning ${folder} ...`,
            timeout: 2000
        });
        await importPaths([folder], true);
    }
}
