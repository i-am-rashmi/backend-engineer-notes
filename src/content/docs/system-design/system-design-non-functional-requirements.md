---
title: "System Design : Non FUnctional Requirements"
---


# Availability


    # **What is availability?**


    **Availability** is the percentage of time a service or infrastructure is accessible and functional under normal conditions. A service with 100% availability operates correctly at all times.


    # **Measuring availability**


    Mathematically, availability `A` is a ratio where a higher value indicates better reliability. It is calculated using the following formula:


    A (in percent)=(Total Time - Amount Of Time Service Was Down)Total Time×100A (in percent)=Total Time(Total Time - Amount Of Time Service Was Down)×100


    Availability is typically measured in “nines.” The table below illustrates the permitted downtime for various availability tiers:


    # **The Nines of Availability**


    | **Availability Percentages vs. Service Downtime** |                       |                        |                       |
    | ------------------------------------------------- | --------------------- | ---------------------- | --------------------- |
    | **Availability %**                                | **Downtime per Year** | **Downtime per Month** | **Downtime per Week** |
    | 90% (1 nine)                                      | 36.5 days             | 72 hours               | 16.8 hours            |
    | 99% (2 nines)                                     | 3.65 days             | 7.20 hours             | 1.68 hours            |
    | 99.5% (2 nines)                                   | 1.83 days             | 3.60 hours             | 50.4 minutes          |
    | 99.9% (3 nines)                                   | 8.76 hours            | 43.8 minutes           | 10.1 minutes          |
    | 99.99% (4 nines)                                  | 52.56 minutes         | 4.32 minutes           | 1.01 minutes          |
    | 99.999% (5 nines)                                 | 5.26 minutes          | 25.9 seconds           | 6.05 seconds          |
    | 99.9999% (6 nines)                                | 31.5 seconds          | 2.59 seconds           | 0.605 seconds         |
    | 99.99999% (7 nines)                               | 3.15 seconds          | 0.259 seconds          | 0.0605 seconds        |


    # **Availability and service providers**


    Service providers calculate availability differently. It is crucial to understand specific calculation methods, as they often exclude certain events:

    - Measurement start times (e.g., service launch vs. client usage start).
    - Partial outages affecting only a subset of clients.
    - Planned maintenance windows.
    - Downtime caused by cyberattacks.

    Therefore, we should carefully understand how a specific provider calculates their availability numbers.


# Reliability

