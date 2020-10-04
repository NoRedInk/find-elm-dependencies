import * as fs from "fs";

/* Read imports from a given file and return them
*/
export function readImports(file: fs.PathLike): Promise<string[] | null> {
    return new Promise(function(resolve, reject){
        // read 60 chars at a time. roughly optimal: memory vs performance
        var stream = fs.createReadStream(file, {encoding: 'utf8', highWaterMark: 8 * 60});
        var buffer = "";
        var parser = new Parser();

        stream.on('error', function () {
            // failed to process the file, so return null
            resolve(null);
        });

        stream.on('data', chunk => {
            buffer += chunk;
            // when the chunk has a newline, process each line
            if (chunk.indexOf('\n') > -1){
                var lines = buffer.split('\n');

                lines.slice(0, lines.length - 1).forEach(line => parser.parseLine(line));
                buffer = lines[lines.length - 1];

                // end the stream early if we're past the imports
                // to save on memory
                if (parser.isPastImports()){
                    stream.destroy();
                }
            }
        });
        stream.on('close', () => {
            resolve(parser.getImports());
        });
    });
}

class Parser {
    moduleRead = false;
    readingImports = false;
    parsingDone = false;
    isInComment = false;
    imports: string[] = [];

    parseLine(line: string) {
        if (this.parsingDone) return;

        if (!this.moduleRead &&
            (line.startsWith('module ')
                || line.startsWith('port module')
                || line.startsWith('effect module')
            )
        ) {
            this.moduleRead = true;
        } else if (this.moduleRead && line.indexOf('import ') === 0){
            this.readingImports = true;
        }

        if (this.isInComment) {
            if (line.endsWith('-}')){
                this.isInComment = false;
            }
            return;
        }

        if (this.readingImports){
            if (line.indexOf('import ') === 0){
                this.imports.push(line);
            } else if (line.indexOf(' ') === 0 || line.trim().length === 0 || line.startsWith('--') ) {
                // ignore lines starting with whitespace while parsing imports
                // and start and end of comments
            } else if (line.startsWith('{-')) {
                this.isInComment = true;
            } else {
                // console.log('detected end of imports', line);
                this.parsingDone = true;
            }
        }
    };

    getImports(): string[] {
        return this.imports;
    }

    isPastImports(): boolean {
        return this.parsingDone;
    }
}