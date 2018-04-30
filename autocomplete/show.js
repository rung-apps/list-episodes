export default function ({ input }, done) {
    fetch(`https://api.tvmaze.com/search/shows?q=${input}`)
        .then(response => response.json())
        .then(result => {
            const shows = result.map(res => res.show.name);
            return done(Array.from(new Set(shows)));
        });
}
