using System;

namespace TestChar
{
    class Program
{
    static void Main(string[] args)
    {
        // 16 bit size
        char primeiraLetraAllan = 'A';

        Console.WriteLine("Primeira do Nome do Allan: " + primeiraLetraAllan);

        primeiraLetraAllan = (char)65;
        //65 means A uppercase in ASCII

        Console.WriteLine(primeiraLetraAllan);

        primeiraLetraAllan = (char)(primeiraLetraAllan + 1);

        Console.WriteLine(primeiraLetraAllan);

        //BeginString
        string titulo = "O ano do início é " + 2021;

        Console.WriteLine(titulo);

        string cursosProgramação =
@"- .NET
- JS
- Java";         
        Console.WriteLine(cursosProgramação);
    }
}
}
