# io-overwatch

[io-event-reactor](https://github.com/bitsofinfo/io-event-reactor) based daemon for monitoring changes within one or more directories;
then reacting by making directories, copying, moving, extracting files or inserting audit records into a database.

[![NPM](https://nodei.co/npm/io-overwatch.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/io-overwatch/)

## Usage

### Method 1

```
>$ git clone https://github.com/bitsofinfo/io-overwatch.git
>$ cd io-overwatch/
>$ npm install .
>$ node overwatch.js
```

### Method 2
```
>$ mkdir overwatch
>$ cd overwatch/
>$ npm install io-overwatch
>$ node node_modules/io-overwatch/overwatch.js
```

```
Usage: overwatch.js <command> [options]

Commands:
  dir  Monitor a directory and react to changes

Options:
  --logging.file                Full path to log file                 [required]
  --logging.level               Logging level
         [choices: "error", "warn", "info", "verbose", "info", "debug", "silly"]
                                                              [default: "debug"]
  --monitor.dir                 Directory to monitor                  [required]
  --monitor.stabilityThreshold   Milliseconds for file sizes to remain constant
                                 before reacting.               [default: 30000]
  --evaluator.events            Space separated list of relevant event types
  [array] [required] [choices: "add", "addDir", "change", "unlink", "unlinkDir"]
  --evaluator.regex             Regex to apply to ioEvent.fullPath to trigger
                                reactors                              [required]
  --evaluator.reactors          Ordered list of reactors
	[array] [required] [choices: "mkdir", "copyFile", "moveFile", "copyAll",
                                          "moveAll", "extractFile", "sqlInsert"]
  --reactor.mkdir.dir           Target dir create. Variables apply.
                                                                 [default: null]
  --reactor.copyAll.target      Target dir to copy all files in monitored dir
                                TO. Variables apply.             [default: null]
  --reactor.moveAll.target      Target dir to move all files in monitored dir
                                TO. Variables apply.             [default: null]
  --reactor.copyFile.target     Target dir to copy evaluated file TO. Variables
                                apply.                           [default: null]
  --reactor.moveFile.target     Target dir to move evaluated file TO. Variables
                                apply.                           [default: null]
  --reactor.extractFile.target  Target dir to extract evaluated file TO.
                                Variables apply.                 [default: null]
  --reactor.sqlInsert.table     Table name for sql insert        [default: null]
  --reactor.sqlInsert.columns   Space separated list of target table columns.
                                                         [array] [default: null]
  --reactor.sqlInsert.values    Space separated list of column values. Variables
                                apply.                   [array] [default: null]
  --reactor.shell.uid           uid to run shell commands as
                                                           [default: 2146091417]
  --reactor.shell.gid           gid to run shell commands as
                                                           [default: 1028219364]
  --reactor.db.host             database host                         [required]
  --reactor.db.port             database port                    [default: 3306]
  --reactor.db.user             database user                         [required]
  --reactor.db.pw               database pw                           [required]
  --reactor.db.name             database name                         [required]

For certain options you can use the following variables:
 {{ioEvent.context.timestamp}}
 {{ioEvent.eventType}}
 {{ioEvent.fullPath}}
 {{ioEvent.parentPath}}
 {{ioEvent.parentName}}
 {{ioEvent.filename}}
 {{ioEvent.uuid}}
 {{ioEvent.context.[copyAll | copyFile | moveAll | moveFile | extractFileTo].target}}
 ```

## Usage samples table: (mysql)

```
CREATE TABLE `io_event` (
  `eventType` varchar(256) NOT NULL,
  `fullPath` varchar(256) DEFAULT NULL,
  `stats` varchar(512) DEFAULT NULL,
  `timestamp` varchar(256) DEFAULT NULL,
  `filename` varchar(256) DEFAULT NULL,
  `uuid` varchar(256) DEFAULT NULL,
  `parentPath` varchar(256) DEFAULT NULL,
  `parentName` varchar(256) DEFAULT NULL,
  `target` varchar(256) DEFAULT NULL,
  `context` varchar(45) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

```

## Usage sample one:

Monitor one dir, when any file matching \*test1\* is changed
make a new target directory, move all files in the same directory
as triggering file to the target dir, and then insert a sql record
of the event.

```
mkdir /tmp/bitsofinfo
pm2 start sample1.pm2.json
```

OR

```
mkdir /tmp/bitsofinfo

node overwatch.js dir  \
	--logging.file=./overwatch.log \
	--monitor.dir=/tmp/bitsofinfo \
	--monitor.stabilityThreshold=1000 \
	--evaluator.events=change \
	--evaluator.regex=".*test1.*" \
	--evaluator.reactors=mkdir moveAll sqlInsert \
	--reactor.mkdir.target=/tmp/{{{ioEvent.context.timestamp}}}/bitsofinfo_target \
	--reactor.moveAll.target=/tmp/{{{ioEvent.context.timestamp}}}/bitsofinfo_target \
	--reactor.sqlInsert.table=io_event \
	--reactor.sqlInsert.columns=context eventType fullPath filename parentPath timestamp uuid parentName target \
	--reactor.sqlInsert.values=moveAllToContext "{{{ioEvent.eventType}}}" "{{{ioEvent.fullPath}}}" "{{{ioEvent.filename}}}" "{{{ioEvent.parentPath}}}" "{{{ioEvent.context.timestamp}}}" "{{{ioEvent.uuid}}}" "{{{ioEvent.parentName}}}" "{{{ioEvent.context.moveAll.target}}}" \
	--reactor.db.host=localhost \
	--reactor.db.user=root \
	--reactor.db.pw=root \
	--reactor.db.name=io_event_reactor
```


## Usage sample two:

Monitor one dir, when any file matching zip/tgz/gz is changed
make a new target directory, extract the zip/tgz to the target dir, then move all files in the same directory
as triggering file to the target dir, and then insert a sql record
of the event.

```
mkdir /tmp/bitsofinfo
pm2 start sample2.pm2.json
```

OR


```
mkdir /tmp/bitsofinfo

node overwatch.js dir  \
	--logging.file=./overwatch.log \
	--monitor.dir=/tmp/bitsofinfo \
	--monitor.stabilityThreshold=1000 \
	--evaluator.events=add change \
	--evaluator.regex="(.+\.zip$|.+\.gz$|.+\.tgz$)" \
	--evaluator.reactors=mkdir extractFileTo moveAll sqlInsert \
	--reactor.mkdir.target=/tmp/{{{ioEvent.context.timestamp}}}/{{{ioEvent.parentName}}}/bitsofinfo_target \
	--reactor.extractFileTo.target=/tmp/{{{ioEvent.context.timestamp}}}/{{{ioEvent.parentName}}}/bitsofinfo_target \
	--reactor.moveAll.target=/tmp/{{{ioEvent.context.timestamp}}}/{{{ioEvent.parentName}}}/bitsofinfo_target \
	--reactor.sqlInsert.table=io_event \
	--reactor.sqlInsert.columns=context eventType fullPath filename parentPath timestamp uuid parentName target \
	--reactor.sqlInsert.values=extractFileToContext "{{{ioEvent.eventType}}}" "{{{ioEvent.fullPath}}}" "{{{ioEvent.filename}}}" "{{{ioEvent.parentPath}}}" "{{{ioEvent.context.timestamp}}}" "{{{ioEvent.uuid}}}" "{{{ioEvent.parentName}}}" "{{{ioEvent.context.extractFileTo.target}}}" \
	--reactor.db.host=localhost \
	--reactor.db.user=root \
	--reactor.db.pw=root \
	--reactor.db.name=io_event_reactor
```
