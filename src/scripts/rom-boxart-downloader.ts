import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as readline from 'readline';

interface ImageMatch {
    filename: string;
    url: string;
    isUSVersion: boolean;
}

async function promptUser(question: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

async function confirmOverwrite(filename: string): Promise<boolean> {
    const answer = await promptUser(
        `File ${filename} already exists. Overwrite? (yes/no): `,
    );
    return answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y';
}

async function fetchDirectoryListing(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            let data = '';

            response.on('data', (chunk) => {
                data += chunk;
            });

            response.on('end', () => {
                resolve(data);
            });
        }).on('error', (error) => {
            reject(error);
        });
    });
}

function parseHtmlForImages(html: string): string[] {
    const imageRegex = /<a href="([^"]+\.png)">/gi;
    const images: string[] = [];
    let match;

    while ((match = imageRegex.exec(html)) !== null) {
        images.push(decodeURIComponent(match[1]));
    }

    return images;
}

function extractGameName(filename: string): string {
    // Remove the file extension to get the game name
    const nameWithoutExt = path.basename(filename, path.extname(filename));
    return nameWithoutExt.toLowerCase().trim();
}

function normalizeString(text: string): string {
    // Normalize special characters for better matching
    // Remove or standardize: periods, apostrophes, underscores, dashes, etc.
    return text
        .toLowerCase()
        .replace(/[._\-']/g, '') // Remove periods, underscores, dashes, apostrophes
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
}

function extractTitleWithoutRegion(imageName: string): string {
    // Remove the region indicator part (e.g., "(USA)", "(Europe)", etc.)
    return imageName.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
}

function findMatchingImage(
    gameTitle: string,
    availableImages: string[],
): ImageMatch | null {
    const normalizedGameTitle = normalizeString(gameTitle);

    // Separate images by whether they have US version
    const usMatches: ImageMatch[] = [];
    const otherMatches: ImageMatch[] = [];

    for (const image of availableImages) {
        const titleWithoutRegion = extractTitleWithoutRegion(image);
        const normalizedImageTitle = normalizeString(titleWithoutRegion);

        // Check if the normalized titles match or if one contains the other
        const isMatch =
            normalizedImageTitle === normalizedGameTitle ||
            normalizedImageTitle.includes(normalizedGameTitle) ||
            normalizedGameTitle.includes(normalizedImageTitle);

        if (isMatch) {
            const isUSVersion =
                image.includes('(USA)') ||
                image.includes('(USA,') ||
                image.includes('(US)') ||
                image.includes('(US,');

            const match: ImageMatch = {
                filename: image,
                url: encodeURIComponent(image),
                isUSVersion,
            };

            if (isUSVersion) {
                usMatches.push(match);
            } else {
                otherMatches.push(match);
            }
        }
    }

    // Prefer US version, but fall back to other versions if available
    if (usMatches.length > 0) {
        return usMatches[0];
    }

    if (otherMatches.length > 0) {
        return otherMatches[0];
    }

    return null;
}

async function downloadImage(
    imageUrl: string,
    outputPath: string,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(outputPath);

        https
            .get(imageUrl, (response) => {
                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            })
            .on('error', (error) => {
                fs.unlink(outputPath, () => { }); // Delete partial file
                reject(error);
            });
    });
}

interface RomFile {
    filename: string;
    relativePath: string;
}

function getAllRomFilesRecursive(dir: string, baseDir: string = dir): RomFile[] {
    const romFiles: RomFile[] = [];

    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(baseDir, fullPath);

            if (entry.isDirectory()) {
                // Recursively search subdirectories
                romFiles.push(...getAllRomFilesRecursive(fullPath, baseDir));
            } else if (entry.isFile()) {
                // Add file with relative path
                romFiles.push({
                    filename: entry.name,
                    relativePath: relativePath,
                });
            }
        }
    } catch (error) {
        console.error(`Error reading directory ${dir}:`, error);
    }

    return romFiles;
}

async function main() {
    try {
        // Get ROM directory from user
        const romDir = await promptUser(
            'Enter the path to your ROM directory: ',
        );

        if (!fs.existsSync(romDir)) {
            console.error(`Error: Directory not found: ${romDir}`);
            process.exit(1);
        }

        // Get base URL from user
        const baseUrl = await promptUser(
            'Enter the base URL for boxart images (e.g., https://thumbnails.libretro.com/Nintendo%20-%20Game%20Boy%20Color/Named_Boxarts/): ',
        );

        if (!baseUrl.endsWith('/')) {
            throw new Error('URL must end with /');
        }

        // Create .res directory
        const resDir = path.join(romDir, '.res');
        if (!fs.existsSync(resDir)) {
            fs.mkdirSync(resDir, { recursive: true });
            console.log(`Created .res directory at: ${resDir}`);
        }

        // Fetch available images from URL
        console.log('Fetching available images from URL...');
        const html = await fetchDirectoryListing(baseUrl);
        const availableImages = parseHtmlForImages(html);

        if (availableImages.length === 0) {
            console.error('Error: No images found at the provided URL');
            process.exit(1);
        }

        console.log(`Found ${availableImages.length} images at the URL\n`);

        // Get ROM files recursively from all subdirectories
        const romFiles = getAllRomFilesRecursive(romDir);

        if (romFiles.length === 0) {
            console.error('Error: No files found in the ROM directory or subdirectories');
            process.exit(1);
        }

        console.log(`Found ${romFiles.length} ROM files (including subdirectories)\n`);

        let successCount = 0;
        let errorCount = 0;

        // Process each ROM file
        for (const romFile of romFiles) {
            const gameTitle = extractGameName(romFile.filename);
            const imageFileName = `${romFile.filename}.png`;
            const imageOutputPath = path.join(resDir, imageFileName);

            // Check if image already exists
            if (fs.existsSync(imageOutputPath)) {
                const shouldOverwrite = await confirmOverwrite(imageFileName);
                if (!shouldOverwrite) {
                    console.log(`Skipped: ${romFile.filename}`);
                    continue;
                }
            }

            // Find matching image
            const match = findMatchingImage(gameTitle, availableImages);

            if (!match) {
                console.error(`ERROR: No matching image found for: ${romFile.filename}`);
                errorCount++;
                continue;
            }

            try {
                // Download the image
                const downloadUrl = baseUrl + match.url;
                console.log(`Downloading: ${romFile.filename} -> ${imageFileName}`);
                await downloadImage(downloadUrl, imageOutputPath);
                console.log(`  ✓ Downloaded successfully\n`);
                successCount++;
            } catch (error) {
                console.error(`  ✗ Failed to download: ${error}\n`);
                errorCount++;
            }
        }

        // Summary
        console.log('\n========== Summary ==========');
        console.log(`Successfully downloaded: ${successCount}`);
        console.log(`Errors: ${errorCount}`);
        console.log(`Images saved to: ${resDir}`);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main();
