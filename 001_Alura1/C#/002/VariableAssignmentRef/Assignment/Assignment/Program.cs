using System;

namespace Assignment
{
    class Program
    {
        static void Main(string[] args)
        {
            int idadeGabriela = 38;
            int idadeAllan = idadeGabriela;

            idadeGabriela = 20;

            Console.WriteLine(idadeAllan);
            Console.WriteLine(idadeGabriela);
        }
    }
}
